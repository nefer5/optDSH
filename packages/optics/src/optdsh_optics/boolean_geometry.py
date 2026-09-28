"""Conservative display contract for the common NSC lens/rectangular-mask cut."""
import re


def attach_boolean_geometry(objects):
    by_index = {o['sourceIndex']: o for o in objects}
    for row in objects:
        if row['type'] != 'Boolean Native':
            continue
        expression = re.sub(r'\s+', '', row['comment']).lower()
        row['booleanDisplay'] = {'expression': row['comment'], 'status': 'unsupported'}
        reason = '首版仅支持 A&B：镜片与无端面倾斜的 Rectangular Volume'
        a = by_index.get(row.get('shapeParameters', {}).get('ObjectA'))
        b = by_index.get(row.get('shapeParameters', {}).get('ObjectB'))
        if (expression == 'a&b' and a and b and
                a['sourceIndex'] < row['sourceIndex'] and b['sourceIndex'] < row['sourceIndex'] and
                a['type'] in ('Standard Lens', 'Even Asphere Lens') and a['geometry']['kind'] == 'lens' and
                b['type'] == 'Rectangular Volume' and b['geometry']['kind'] == 'box'):
            angles = ('FrontXAngle', 'FrontYAngle', 'RearXAngle', 'RearYAngle')
            if all(b.get('shapeParameters', {}).get(k) == 0 for k in angles):
                row['booleanDisplay'].update(status='supported', operation='intersection',
                    operandIds=[a['objectId'], b['objectId']], anchorObjectId=a['objectId'],
                    frame='operand A local; result placed by Boolean worldTransform')
                row['geometry'] = {'kind': 'boolean', 'fidelity': 'parameterized-approximation',
                    'units': 'mm', 'origin': 'first-operand-origin',
                    'dimensionSource': 'ZOS-API operand parameters and Boolean Comment',
                    'note': 'A∩B 闭合网格裁切；圆锥基底近似，未包含高阶非球面/倒角；不用于求解'}
                row['displayCategory'] = 'lens'
                continue
            reason = '裁切体端面倾角缺失或非零；尚不支持，保留定位标记'
        row['booleanDisplay']['reason'] = reason
        row['geometry']['note'] = reason
