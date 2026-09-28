from html import escape

def results_section(result, config):
    def table(title,headers,rows):
        return '<h3>'+escape(title)+'</h3><div class="table-wrap"><table><thead><tr>'+''.join('<th>'+escape(h)+'</th>' for h in headers)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+escape(str(v))+'</td>' for v in r)+'</tr>' for r in rows)+'</tbody></table></div>'
    def num(v):return f'{v:.6g}' if isinstance(v,(float,int)) else '未记录'
    out=table('名义目标',['目标','RMS H / mm','等效角宽 / mrad','功率','距离 / mm'],[[m['name'],num(m['rmsMM']),num(m['angleMrad']),num(m['power']),num(m['distanceMM'])] for m in result.get('nominal',[])])
    if result.get('samples'):
        rows=[]
        for sample in result['samples']:
            for pre,post in zip(sample['before'],sample['after']):rows.append([sample['index'],post['name'],num(pre['angleMrad']),num(post['angleMrad']),'有效' if sample['valid'] else '功率或行程失效'])
        out+=table('同一MC样本补偿前后',['样本','目标','补偿前 / mrad','补偿后 / mrad','有效性'],rows)
    if result.get('sensitivity'):
        rows=[]
        for r in result['sensitivity']:
            for phase,k in [('Min','minus'),('Max','plus')]:
                for m in r.get(k,[]):rows.append([r['label'],r['axis'],phase,m['name'],num(m['angleMrad']),'有效' if r.get(k+'Valid') else '未通过'])
        out+=table('原生灵敏度端点回读',['盲装件','维度','端点','目标','角宽 / mrad','有效性'],rows)
    return out
