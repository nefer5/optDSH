"""Offline report sections; no Zemax import, no remote images or plotting dependency."""
from html import escape
from .object_labels import object_label


def setup(config, result):
    rows = [('指标定义', 'A源=4xy；P归一=P源×A最大/A源；eff=flux/P源；norm_eff=flux/P归一'),
            ('最大接收面积', str(config['efficiency']['max_receive_area_mm2'])+' mm²'),
            ('坐标与单位', '对象局部控制角 / deg；几何 / mm')]
    for name, c in config['controls'].items():
        rows.append((name, f"{object_label(c['object_id'],c)} {c['field']}；initial={c['initial']}；FOV={c['fov']['scale']}×actual+{c['fov']['offset_deg']} deg"))
    rows.append(('探测面', '；'.join(f"{n}: {object_label(d['object_id'],d)} total_flux" for n,d in config['detectors'].items())))
    rows.append(('回波源对象',object_label(config['source']['object_id'],config['source'])))
    for p in config.get('pickups',[]):
        c=config['controls'][p['from_control']]
        rows.append(('Pickup',f"{object_label(p['object_id'],p)} {p['field']} ← {object_label(c['object_id'],c)} {c['field']}；scale={p['scale']}，offset={p['offset']}"))
    source = result.get('inspection',{}).get('source',{})
    if source:
        rows.append(('回波源', f"{source['powerW']} W；面积 {source['areaMM2']} mm²；{source['analysisRays']} 条分析光线；P归一 {source['normalizationPowerW']} W"))
    else:
        rows.append(('回波源', '未读取宿主；源功率、源面积和实际光线数未知'))
    return rows


def results_section(result, config):
    rows = result.get('rows',[])
    if not rows:
        return '<p>尚无扫描测量值。离线计划和只读预检不代表完成追迹。</p>'
    keys = [k for k in rows[0] if k.startswith(('flux_','eff_','norm_eff_')) or k == 'near_rx_over_mirror']
    from .rx_scan import plan
    grid_plan = plan(config, result.get('inspection',{}).get('controls'))
    planned = grid_plan['cases']
    text = '<p>H/V为配置换算后的角度（deg）；矩阵行V、列H，按扫描顺序排列。色标固定0–1；超出范围仅颜色饱和，数值保持原值。</p>'
    for name in config['detectors']:
        key = 'norm_eff_'+name
        hs = sorted({r['hIndex'] for r in planned}); vs = sorted({r['vIndex'] for r in planned})
        lookup = {(r['vIndex'],r['hIndex']):r for r in rows}
        detector=config['detectors'][name]
        text += '<h3>'+escape(key+' · '+object_label(detector['object_id'],detector))+'</h3><div class="table-wrap"><table><thead><tr><th>V° / H°</th>'
        for h in hs:
            angle = next(r['angle_H'] for r in planned if r['hIndex']==h)
            text += '<th>'+('未解析' if angle is None else f'{angle:g}')+'</th>'
        text += '</tr></thead><tbody>'
        for v in vs:
            angle = next(r['angle_V'] for r in planned if r['vIndex']==v)
            text += '<tr><th>'+('未解析' if angle is None else f'{angle:g}')+'</th>'
            for h in hs:
                value = lookup.get((v,h),{}).get(key)
                if value is None: text += '<td>—</td>'
                else:
                    saturation = max(0,min(1,value))
                    light = 97-65*saturation
                    color = '#fff' if saturation > .65 else '#172b26'
                    text += f'<td style="background:hsl(156 28% {light:.1f}%);color:{color}">{value:.6g}</td>'
            text += '</tr>'
        text += '</tbody></table></div>'
    text += '<h3>逐点结果</h3><div class="table-wrap"><table><thead><tr>'
    columns = ['angle_H','angle_V']+keys
    text += ''.join('<th>'+escape(k)+'</th>' for k in columns)+'</tr></thead><tbody>'
    for r in rows:
        text += '<tr>'+''.join('<td>'+('—' if r[k] is None else f'{r[k]:.6g}')+'</td>' for k in columns)+'</tr>'
    return text+'</tbody></table></div>'
