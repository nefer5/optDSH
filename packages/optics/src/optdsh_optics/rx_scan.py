"""Rx collection scan, adapted from N02's lidar-rx-collection-efficiency-scan.

Pure planning/metrics are separate from the lazy ZOS adapter. Only an independent
CopySystem can reach the scan loop; no primary Save/Load/backup or restoration.
"""
import csv
import copy
import itertools
import json
import math
from pathlib import Path
import re
import sys
import time

from .domain import fingerprint, make_snapshot
from .run_bundle import sha, write_json

FIELDS = {'TiltAboutX', 'TiltAboutY', 'TiltAboutZ'}
NOTES = (
    '面积归一效率 = 通量 × 源面积 / (源功率 × 指定最大接收面积)；不等同于PDE或绝对脉冲能量。',
    '效率色标固定0–1，越界数值保留；零参考通量的比值为不可计算，不是零效率。',
    '模型内pickup和坐标链传播扫描角；角度换算由配置确认，不是通用转镜规则。',
    'cancel.request仅在点间检查；正在执行的RunAndWait不能靠结束Agent保证取消。',
    '版本指纹覆盖采集字段及本工作流检查字段，不能证明宿主全部状态原子一致；运行期间勿手动编辑模型。',
)


def number(value, name, positive=False):
    if type(value) not in (int, float) or not math.isfinite(value) or (positive and value <= 0):
        raise ValueError('Invalid finite number: ' + name)
    return value


def integer(value, name, low=1, high=1000000):
    if type(value) is not int or not low <= value <= high:
        raise ValueError('Invalid integer: ' + name)
    return value


def deltas(control):
    if ('deltas' in control) == ('range' in control):
        raise ValueError('Choose exactly one of deltas/range')
    if 'deltas' in control:
        values = control['deltas']
        if not isinstance(values, list) or not 1 <= len(values) <= 1000:
            raise ValueError('deltas needs 1..1000 points')
    else:
        r = control['range']
        a, b = number(r['start'], 'range.start'), number(r['stop'], 'range.stop')
        n = integer(r['num'], 'range.num', high=1000)
        if n == 1 and a != b:
            raise ValueError('Single-point range requires start == stop')
        values = [a] if n == 1 else [a + (b-a)*i/(n-1) for i in range(n)]
    values = [number(v, 'delta') for v in values]
    if len(set(values)) != len(values):
        raise ValueError('Duplicate scan coordinates')
    return values


def validate(config, live=False, execute=False):
    if config.get('kind') != 'rx-collection-efficiency':
        raise ValueError('Rx collection configuration required')
    for key in ('modelId', 'expectedRevision'):
        if not isinstance(config.get(key), str) or not config[key].strip():
            raise ValueError('Missing ' + key)
        if live and config[key].startswith('REPLACE_'):
            raise ValueError('Replace model identity/revision before connecting')
    if config.get('units') != 'mm' or config.get('controlFrame') != 'object-local':
        raise ValueError('Only mm and object-local control fields supported')
    if set(config['controls']) != {'scanner_h', 'echo_v'}:
        raise ValueError('Exactly scanner_h and echo_v controls required')
    roles = list(config['controls'].values()) + [config['source']] + list(config['detectors'].values())
    for role in roles + config['pickups']:
        integer(role['object_id'], 'object_id')
        for key in ('expectedType', 'expectedComment'):
            if not isinstance(role.get(key), str) or (key == 'expectedType' and not role[key]):
                raise ValueError('Explicit identity required: ' + key)
            if live and role[key].startswith('REPLACE_'):
                raise ValueError('Replace object identity before connecting')
    if len({r['object_id'] for r in roles}) != len(roles):
        raise ValueError('Control/source/detector roles must be distinct')
    count = 1
    for c in config['controls'].values():
        if c['field'] not in FIELDS:
            raise ValueError('Only angular controls supported')
        if c['initial'] is not None:
            number(c['initial'], 'initial')
        count *= len(deltas(c))
        for key in ('scale', 'offset_deg'):
            number(c['fov'][key], 'fov.'+key)
        if c['fov']['scale'] == 0:
            raise ValueError('FOV scale cannot be zero')
    if count > 10000:
        raise ValueError('Scan exceeds 10000 points')
    for p in config['pickups']:
        if p['field'] not in FIELDS or p['from_control'] not in config['controls']:
            raise ValueError('Invalid pickup mapping')
        for key in ('scale', 'offset'):
            number(p[key], 'pickup.'+key)
    if not config['detectors'] or len(config['detectors']) > 16:
        raise ValueError('Need 1..16 detectors')
    for name, d in config['detectors'].items():
        if not re.fullmatch('[a-z][a-z0-9_]{0,31}', name) or d['metric'] != 'total_flux' or d['expectedType'] != 'Detector Rectangle':
            raise ValueError('Named Detector Rectangle total_flux required')
    source = config['source']
    if source['expectedType'] != 'Source Rectangle':
        raise ValueError('Source Rectangle required')
    columns = [source[k] for k in ('analysis_rays_col','power_field_col','x_half_width_col','y_half_width_col')]
    for col in columns:
        integer(col, 'source column', high=100)
    if len(set(columns)) != 4:
        raise ValueError('Source columns must be distinct')
    number(config['efficiency']['max_receive_area_mm2'], 'maximum area', True)
    for key in ('split', 'scatter', 'polarization'):
        if type(config['trace'][key]) is not bool:
            raise ValueError('Trace options must be booleans')
    integer(config['trace']['seed'], 'seed', low=0, high=2147483647)
    preparation = config.get('copySourcePreparation')
    if preparation is not None:
        integer(preparation['analysisRays'], 'copy source rays', high=10000000)
        disabled = preparation['disableSources']
        if not isinstance(disabled, list): raise ValueError('disableSources must be a list')
        ids = []
        for role in disabled:
            ids.append(integer(role['object_id'], 'disabled source'))
            if not isinstance(role.get('expectedType'),str) or not role['expectedType'].startswith('Source ') or not isinstance(role.get('expectedComment'),str):
                raise ValueError('Explicit disabled source identity required')
        if len(set(ids)) != len(ids) or source['object_id'] in ids:
            raise ValueError('Invalid disabled source selection')
    if execute:
        if not re.fullmatch('[0-9a-f]{64}', config.get('expectedInspectionDigest', '')):
            raise ValueError('Use inspectionDigest from the reviewed dry-run')
        if not isinstance(config.get('expertConfirmation'), str) or not config['expertConfirmation'].strip() or config['expertConfirmation'].startswith('REPLACE_'):
            raise ValueError('Expert confirmation of inspected mapping required')
    return count


def plan(config, current=None):
    validate(config)
    axes = {}
    for name, c in config['controls'].items():
        initial = c['initial'] if c['initial'] is not None else (current or {}).get(name)
        if initial is not None:
            number(initial, 'resolved initial')
        axes[name] = {'initial': initial, 'deltas': deltas(c), 'fov': c['fov']}
    cases = []
    # Matrix row = V, column = H, both in the explicitly configured order.
    for v, h in itertools.product(range(len(axes['echo_v']['deltas'])), range(len(axes['scanner_h']['deltas']))):
        row = {'hIndex': h, 'vIndex': v}
        for name, index, angle in [('scanner_h', h, 'angle_H'), ('echo_v', v, 'angle_V')]:
            a = axes[name]
            value = None if a['initial'] is None else number(a['initial'] + a['deltas'][index], 'actual control')
            row[name] = value
            row[angle] = None if value is None else number(value*a['fov']['scale'] + a['fov']['offset_deg'], 'FOV angle')
        cases.append(row)
    return {'axes': axes, 'cases': cases, 'resolved': all(a['initial'] is not None for a in axes.values())}


def metrics(fluxes, power, area, maximum):
    def ratio(a, b):
        return a/b if a is not None and b is not None and math.isfinite(a) and math.isfinite(b) and b > 0 else None
    norm = ratio(power*maximum, area)
    result = {}
    for name, flux in fluxes.items():
        number(flux, 'flux')
        result.update({f'flux_{name}': flux, f'eff_{name}': ratio(flux, power), f'norm_eff_{name}': ratio(flux, norm)})
    if 'mirror' in fluxes and 'near_rx' in fluxes:
        result['near_rx_over_mirror'] = ratio(fluxes['near_rx'], fluxes['mirror'])
    return result


def identity(nce, role):
    if role['object_id'] > int(nce.NumberOfObjects):
        raise ValueError('Object out of bounds')
    obj = nce.GetObjectAt(role['object_id'])
    if str(obj.TypeName) != role['expectedType'] or str(obj.Comment) != role['expectedComment']:
        raise ValueError('Object identity mismatch: '+str(role['object_id']))
    return obj


def flux(nce, index):
    ok, value = nce.GetDetectorData(index, 0, 0, 0)
    if not ok:
        raise RuntimeError('GetDetectorData failed: '+str(index))
    return number(float(value), 'detector flux')


def source_solve(cell):
    solve = cell.GetSolveData()
    result = {'type': str(solve.Type)}
    if result['type'] == 'ObjectPickup':
        p = solve._S_ObjectPickup
        result.update(object=int(p.Object), column=str(p.Column), scale=float(p.ScaleFactor), offset=float(p.Offset))
    return result


def inspect(system, config, prepared=False):
    """Reads only. Detector contents are evidence, excluded from stable identity digest."""
    nce = system.NCE
    info = {'controls': {}, 'pickups': [], 'source': {}, 'detectors': {}, 'otherSources': [], 'warnings': []}
    for name, c in config['controls'].items():
        obj = identity(nce, c)
        cell = getattr(obj, c['field']+'Cell')
        if str(cell.GetSolveData().Type) != 'Fixed':
            raise ValueError('Control must have Fixed solve: '+name)
        value = number(float(cell.DoubleValue), name)
        info['controls'][name] = value
        if c['initial'] is not None and not math.isclose(value, c['initial'], abs_tol=1e-9, rel_tol=0):
            info['warnings'].append(name+': YAML initial differs from current; only copy will change')
    aliases = {'TiltAboutX': {'TiltAboutX','TiltX'}, 'TiltAboutY': {'TiltAboutY','TiltY'}, 'TiltAboutZ': {'TiltAboutZ','TiltZ'}}
    for p in config['pickups']:
        obj = identity(nce, p)
        solve = getattr(obj, p['field']+'Cell').GetSolveData()
        if str(solve.Type) != 'ObjectPickup':
            raise ValueError('Expected ObjectPickup')
        pickup = solve._S_ObjectPickup
        c = config['controls'][p['from_control']]
        actual = {'object': int(pickup.Object), 'column': str(pickup.Column), 'scale': float(pickup.ScaleFactor), 'offset': float(pickup.Offset)}
        if actual['object'] != c['object_id'] or actual['column'] not in aliases[c['field']] or any(not math.isclose(actual[k], p[k], abs_tol=1e-9, rel_tol=0) for k in ('scale','offset')):
            raise ValueError('Pickup mismatch')
        info['pickups'].append(actual)
    s = config['source']; obj = identity(nce, s)
    source = info['source']
    for key, col in [('powerW','power_field_col'), ('xHalfWidthMM','x_half_width_col'), ('yHalfWidthMM','y_half_width_col')]:
        source[key] = number(float(obj.GetCellAt(s[col]).DoubleValue), key, True)
    preparation = config.get('copySourcePreparation')
    disabled = {r['object_id'] for r in preparation['disableSources']} if preparation else set()
    if preparation:
        for role in preparation['disableSources']: identity(nce, role)
    source['analysisRays'] = integer(int(obj.GetCellAt(s['analysis_rays_col']).IntegerValue), 'analysis rays', low=0 if preparation and not prepared else 1, high=1000000000)
    source['analysisRaysSolve'] = source_solve(obj.GetCellAt(s['analysis_rays_col']))
    if prepared and preparation and source['analysisRays'] != preparation['analysisRays']:
        raise ValueError('Prepared source rays mismatch')
    source['areaMM2'] = number(4*source['xHalfWidthMM']*source['yHalfWidthMM'], 'source area', True)
    source['normalizationPowerW'] = number(source['powerW']*config['efficiency']['max_receive_area_mm2']/source['areaMM2'], 'normalization power', True)
    # Other emitters contaminate a single-source normalization. Never silently disable them.
    for i in range(1, int(nce.NumberOfObjects)+1):
        o = nce.GetObjectAt(i)
        if 'Source' in str(o.TypeName) and i != s['object_id']:
            rays = int(o.GetCellAt(12).IntegerValue)
            info['otherSources'].append({'index': i, 'type': str(o.TypeName), 'analysisRays': rays, 'analysisRaysSolve': source_solve(o.GetCellAt(12))})
            if rays != 0 and (prepared or i not in disabled):
                raise ValueError('Other source has analysis rays: '+str(i))
    for name, d in config['detectors'].items():
        o = identity(nce, d)
        info['detectors'][name] = {'index': d['object_id'], 'currentFlux': flux(nce, d['object_id']),
            'xHalfWidthMM': float(o.GetCellAt(11).DoubleValue), 'yHalfWidthMM': float(o.GetCellAt(12).DoubleValue),
            'xPixels': int(o.GetCellAt(13).IntegerValue), 'yPixels': int(o.GetCellAt(14).IntegerValue)}
    return info


def prepare_copy_sources(clone, config, primary_info):
    """Only invoked after CopySystem identity validation. Never fixes unknown solves."""
    preparation = config.get('copySourcePreparation')
    if not preparation: return primary_info
    expected = copy.deepcopy(primary_info)
    changes = [(config['source'], config['source']['analysis_rays_col'], preparation['analysisRays'])]
    changes += [(role, 12, 0) for role in preparation['disableSources']]
    for role, column, rays in changes:
        cell = identity(clone.NCE, role).GetCellAt(column)
        solve = str(cell.GetSolveData().Type)
        if solve not in ('Fixed', 'ObjectPickup'):
            raise ValueError('Unsupported analysis rays solve: '+solve)
        if solve == 'ObjectPickup' and not cell.MakeSolveFixed():
            raise RuntimeError('Cannot fix analysis-ray pickup on copy')
        if str(cell.GetSolveData().Type) != 'Fixed':
            raise RuntimeError('Copy source solve readback failed')
        cell.IntegerValue = rays
        if int(cell.IntegerValue) != rays: raise RuntimeError('Copy source preparation readback failed')
    expected['source']['analysisRays'] = preparation['analysisRays']
    expected['source']['analysisRaysSolve'] = {'type':'Fixed'}
    disabled = {r['object_id'] for r in preparation['disableSources']}
    for source in expected['otherSources']:
        if source['index'] in disabled:
            source['analysisRays'] = 0
            source['analysisRaysSolve'] = {'type':'Fixed'}
    return expected


def inspection_digest(info):
    stable = json.loads(json.dumps(info))
    for d in stable['detectors'].values():
        d.pop('currentFlux')
    return fingerprint(stable)


def scan_copy(clone, config, resolved, out, result):
    """Caller must establish independent system identity. Partial rows survive errors."""
    nce = clone.NCE
    trace = clone.Tools.OpenNSCRayTrace()
    if trace is None:
        raise RuntimeError('NSC trace unavailable')
    try:
        trace.SplitNSCRays = config['trace']['split']; trace.ScatterNSCRays = config['trace']['scatter']
        trace.UsePolarization = config['trace']['polarization']; trace.IgnoreErrors = False; trace.SaveRays = False
        for case in resolved['cases']:
            if (out/'cancel.request').exists():
                result['status'] = 'cancelled'; return
            start = time.monotonic()
            for name, c in config['controls'].items():
                cell = getattr(nce.GetObjectAt(c['object_id']), c['field']+'Cell')
                cell.DoubleValue = float(case[name])
                if not math.isclose(float(cell.DoubleValue), case[name], abs_tol=1e-9, rel_tol=0):
                    raise RuntimeError('Control readback failed: '+name)
            trace.ClearDetectors(0); trace.SetRandomSeed(config['trace']['seed']); trace.RunAndWaitForCompletion()
            if not bool(trace.Succeeded):
                raise RuntimeError('Ray trace failed: '+str(trace.ErrorMessage))
            source = result['inspection']['source']
            # Refuse models where a solve unexpectedly changes the normalization source.
            s = config['source']; obj = nce.GetObjectAt(s['object_id'])
            for key, col in [('powerW','power_field_col'), ('xHalfWidthMM','x_half_width_col'), ('yHalfWidthMM','y_half_width_col')]:
                if not math.isclose(float(obj.GetCellAt(s[col]).DoubleValue), source[key], rel_tol=0, abs_tol=1e-12):
                    raise RuntimeError('Source normalization changed during scan')
            values = {name: flux(nce, d['object_id']) for name, d in config['detectors'].items()}
            row = {**case, **metrics(values, source['powerW'], source['areaMM2'], config['efficiency']['max_receive_area_mm2']), 'elapsedSeconds': time.monotonic()-start}
            result['rows'].append(row)
            write_json(out/'progress.json', {'status':'running', 'rows':result['rows'], 'totalPoints':len(resolved['cases'])})
            print(json.dumps({'point':len(result['rows']), 'total':len(resolved['cases']), 'seconds':row['elapsedSeconds']}), flush=True)
        result['status'] = 'completed'
    finally:
        trace.Close()


def run_host(config, bridge, out, execute=False, factory=None, read_scene=None):
    validate(config, live=True, execute=execute)
    if factory is None:
        from .connection import OpticStudio
        factory = OpticStudio
    if read_scene is None:
        from .capture import read_pass
        read_scene = read_pass
    out = Path(out)
    result = {'status':'failed', 'rows':[], 'cleanupErrors':[], 'provenance':'zos-api'}
    with factory(mode='extension', instance=bridge['instance']) as z:
        primary = z.system
        if Path(str(primary.SystemFile)).resolve() != Path(bridge['expectedFile']).resolve():
            raise ValueError('Unexpected primary model')
        if primary.Tools.CurrentTool is not None:
            raise RuntimeError('Primary tool busy')
        before = read_scene(primary)
        snapshot = make_snapshot({**before, 'provenance':'zos-api'})
        if (snapshot['modelId'], snapshot['revision']) != (config['modelId'], config['expectedRevision']):
            raise ValueError('STALE_REVISION')
        info = inspect(primary, config)
        digest = inspection_digest(info)
        result.update(inspection=info, inspectionDigest=digest, modelId=snapshot['modelId'], revision=snapshot['revision'])
        write_json(out/'model_inspection.json', result)
        resolved = plan(config, info['controls']); write_json(out/'plan.json', resolved)
        if execute and digest != config['expectedInspectionDigest']:
            raise ValueError('STALE_INSPECTION: repeat dry-run and expert review')
        pid, dirty, disk = str(primary.SystemID), bool(primary.NeedsSave), sha(Path(str(primary.SystemFile)))
        clone = None
        try:
            if fingerprint(read_scene(primary)) != fingerprint(before) or inspection_digest(inspect(primary, config)) != digest:
                raise RuntimeError('Primary changed during preflight')
            if not execute:
                result['status'] = 'preflight-passed'
            else:
                candidate = primary.CopySystem()
                if candidate is None or str(candidate.SystemID) == pid:
                    raise RuntimeError('Independent CopySystem required')
                clone = candidate
                if inspection_digest(inspect(clone, config)) != digest:
                    raise RuntimeError('Copy preflight differs from primary')
                expected_copy = prepare_copy_sources(clone, config, info)
                prepared_info = inspect(clone, config, prepared=True)
                if inspection_digest(prepared_info) != inspection_digest(expected_copy):
                    raise RuntimeError('Prepared copy differs beyond authorized source rays')
                result['primaryInspection'] = info
                result['inspection'] = prepared_info
                result['copySourcePreparation'] = config.get('copySourcePreparation')
                result['copySystemId'] = str(clone.SystemID)
                scan_copy(clone, config, resolved, out, result)
        except Exception as exc:
            result.update(status='failed', error=type(exc).__name__+': '+str(exc))
        finally:
            if clone is not None:
                try:
                    result['copyClosed'] = bool(clone.Close(False))
                    if not result['copyClosed']: result['cleanupErrors'].append('Copy close returned false')
                except Exception as exc:
                    result['cleanupErrors'].append('Copy close: '+str(exc))
            try:
                result['primaryUnchanged'] = (str(z.application.PrimarySystem.SystemID) == pid and bool(primary.NeedsSave) == dirty
                    and sha(Path(str(primary.SystemFile))) == disk and fingerprint(read_scene(primary)) == fingerprint(before)
                    and inspection_digest(inspect(primary, config)) == digest)
                result['primaryFileSHA256'] = disk
            except Exception as exc:
                result['primaryUnchanged'] = None; result['cleanupErrors'].append('Primary audit: '+str(exc))
            if result['primaryUnchanged'] is not True or result['cleanupErrors']:
                result['status'] = 'verification-failed'
            write_json(out/'result.json', result)
    return result


def write_artifacts(out, config, resolved, rows):
    import numpy as np
    out = Path(out)
    if not rows:
        return
    with (out/'results.csv').open('w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0])); writer.writeheader(); writer.writerows(rows)
    shape = (len(resolved['axes']['echo_v']['deltas']), len(resolved['axes']['scanner_h']['deltas']))
    names = [k for k in rows[0] if k.startswith(('flux_','eff_','norm_eff_')) or k == 'near_rx_over_mirror']
    grids = {}
    for name in names:
        grid = np.full(shape, np.nan)
        for r in rows:
            grid[r['vIndex'], r['hIndex']] = np.nan if r[name] is None else r[name]
        grids[name] = grid
    np.savez_compressed(out/'matrices.npz', **grids)
    axes = {}
    for name, a in resolved['axes'].items():
        axes[name] = [(a['initial']+d)*a['fov']['scale']+a['fov']['offset_deg'] for d in a['deltas']]
    write_json(out/'matrix-index.json', {'file':'matrices.npz','shape':list(shape),'dtype':'float64','rowAxis':'echo_v','columnAxis':'scanner_h','axesDeg':axes,'metrics':names,'missing':'NaN = incomplete point or undefined ratio','efficiencyColorLimits':[0,1]})
