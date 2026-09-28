"""Explicit GUI-button saves of the named primary system; never SaveAs/LoadFile."""
import json
from pathlib import Path
import sys

from .capture import snapshot_in_connection, connection_error
from .domain import OpticsError, make_snapshot
from .run_bundle import RunBundle, sha, write_json


def save_connected(zos, connection, config, bundle):
    system = zos.system
    path = Path(str(system.SystemFile)).resolve()
    if not str(system.SystemFile).strip() or path != Path(config['expectedFile']).resolve():
        raise OpticsError('UNEXPECTED_MODEL', '目标模型已变化，未保存；请重新探测')
    if not path.is_file():
        raise OpticsError('UNSAVED_MODEL', '请先在 Zemax 中另存为并命名模型；工作台仅保存到已有路径')
    if str(system.SystemID) != config['systemId']:
        raise OpticsError('STALE_SYSTEM', '宿主系统已重新打开，未保存；请刷新或重新探测')
    raw = snapshot_in_connection(zos, connection, config['instance'])
    snap = make_snapshot(raw)
    if snap['modelId'] != config['modelId'] or snap['revision'] != config['expectedRevision']:
        raise OpticsError('STALE_REVISION', '模型在确认后发生变化，未保存；请刷新或重新探测后再点击保存')
    evidence = {'sourceFile':str(path), 'instance':config['instance'], 'systemId':str(system.SystemID),
                'modelId':snap['modelId'], 'revision':snap['revision'], 'dirtyBefore':bool(system.NeedsSave),
                'saveAttempted':False, 'beforeSha256':sha(path), 'run':str(bundle.path)}
    if evidence['dirtyBefore']:
        relative = 'backup/model-before'+path.suffix.lower()
        bundle.copy(path, relative)
        evidence['backup'] = str(bundle.path/relative)
        if sha(bundle.path/relative) != evidence['beforeSha256'] or sha(path) != evidence['beforeSha256']:
            raise OpticsError('DISK_CHANGED', '备份期间磁盘文件变化，未保存')
        # Recheck after disk I/O. No geometry or parameter setter is invoked.
        check = make_snapshot(snapshot_in_connection(zos, connection, config['instance']))
        if (check['modelId'] != snap['modelId'] or check['revision'] != snap['revision']
                or str(system.SystemID) != config['systemId'] or not bool(system.NeedsSave)):
            raise OpticsError('STALE_REVISION', '备份期间宿主状态变化，未保存')
        evidence.update(saveAttempted=True, status='saving')
        write_json(bundle.path/'save-state.json', evidence)
        try:
            result = system.Save()
            if result is False:
                raise RuntimeError('Save returned false')
        except Exception as exc:
            raise OpticsError('SAVE_UNCERTAIN', '保存调用未完成确认；请核对 Zemax，不会自动重试。'+type(exc).__name__) from None
    after = snapshot_in_connection(zos, connection, config['instance'])
    after_snap = make_snapshot(after)
    if (bool(system.NeedsSave) or str(system.SystemID) != config['systemId'] or
            Path(str(system.SystemFile)).resolve() != path or after_snap['revision'] != snap['revision']):
        raise OpticsError('SAVE_UNCERTAIN', '保存后回读不一致；请核对 Zemax 和备份，不会自动重试')
    evidence.update(status='saved' if evidence['saveAttempted'] else 'already_saved',
                    dirtyAfter=False, afterSha256=sha(path))
    write_json(bundle.path/'save-state.json', evidence)
    return after, evidence


def execute_save_run(run_path):
    run_path = Path(run_path).resolve()
    config = json.loads((run_path/'config/resolved.json').read_text(encoding='utf-8'))
    root = Path(config['projectRoot'])
    bundle = RunBundle(run_path, root, json.loads((run_path/'manifest.json').read_text(encoding='utf-8')))
    # A worker/run may never replay a save after process/network ambiguity.
    if (run_path/'save-state.json').exists() or (run_path/'result.json').exists():
        return {'ok':False, 'error':{'code':'SAVE_UNCERTAIN','message':'本次保存已有执行记录，不会重放'}}
    try:
        if config.get('authorization') != 'explicit-save-button':
            raise OpticsError('SAVE_NOT_AUTHORIZED', '需要显式保存按钮授权')
        from .connection import OpticStudio
        import msvcrt
        with (root/'.runtime/tx-pilot.lock').open('a+b') as lock:
            lock.seek(0);lock.write(b'0');lock.flush();lock.seek(0)
            try:msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
            except OSError:raise OpticsError('HOST_BUSY', '公差或其他光学作业占用宿主，未保存') from None
            try:
                with OpticStudio(mode='extension', instance=config['instance']) as zos:
                    raw, saved = save_connected(zos, Path(__file__).with_name('connection.py'), config, bundle)
            finally:lock.seek(0);msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
        bundle.write('snapshot.json', raw)
        bundle.finish('completed', {'status':'completed', 'saved':saved,
            'report':{'summary':'保存完成并回读确认。' if saved['saveAttempted'] else '模型已保存，无需重复写盘。'}},
            notes=['保存前的磁盘旧版本在backup目录（实际写盘时）。恢复须先在Zemax关闭/另存当前模型，再由用户显式恢复备份；不自动回滚宿主。',
                   '只调用Save，未设置光学参数；快照revision仅覆盖导出字段。'])
        return {'ok':True, 'raw':raw, 'saved':saved}
    except Exception as exc:
        error = exc.payload() if isinstance(exc, OpticsError) else connection_error(exc, config['instance'])
        journal = json.loads((run_path/'save-state.json').read_text()) if (run_path/'save-state.json').exists() else {}
        if journal.get('saveAttempted'):
            error['code'] = 'SAVE_UNCERTAIN'
            error['message'] = '保存结果未确认，请核对 Zemax；不会自动重试。'+error['message']
        bundle.finish('failed', {'status':'failed','error':error['message'],'saveState':journal},
                      notes=['保留原始证据与备份；不要把失败或未确认当作未发生磁盘写入。'])
        return {'ok':False, 'error':error}
