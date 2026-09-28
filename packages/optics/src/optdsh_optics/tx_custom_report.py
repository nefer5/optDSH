"""Scientific plots and HTML sections for script-owned Tx analysis."""
from pathlib import Path
from html import escape
import math
import numpy as np

def plot_results(path,result,config=None):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.colors import LogNorm
    path=Path(path);folder=path/'figures';folder.mkdir(exist_ok=True)
    plt.rcParams.update({'font.size':10,'axes.spines.top':False,'axes.spines.right':False,'savefig.dpi':160})
    fig,ax=plt.subplots(figsize=(9,4.2),layout='constrained')
    colors=['#187e7b','#b87136']
    for j,n in enumerate(result.get('nominal',[])):
        points=[(s['index'],s['before'][j]['angleMrad']) for s in result.get('samples',[]) if s['before'][j].get('angleMrad') is not None]
        if points:ax.scatter(*zip(*points),color=colors[j],label=n['name']+' before',s=34)
        if n.get('angleMrad') is not None:ax.axhline(n['angleMrad'],color=colors[j],ls='--',lw=1,label=n['name']+' nominal')
        last=result.get('samples',[])[-1:] or []
        if last and last[0].get('after') and last[0]['after'][j].get('angleMrad') is not None:
            ax.scatter(last[0]['index'],last[0]['after'][j]['angleMrad'],marker='*',s=155,color=colors[j],edgecolors='black',linewidths=.5,label=n['name']+' last sample after')
    ax.set(xlabel='Independent MC sample index',ylabel='RMS H equivalent angle / mrad',title='MC distribution and last-sample compensation');ax.grid(alpha=.2);ax.legend(fontsize=8,ncol=2)
    fig.savefig(folder/'mc-scatter.png');plt.close(fig)
    result['figures']=['figures/mc-scatter.png']
    samples=result.get('samples',[])
    if samples and result.get('nominal'):
        final=result.get('compensation',{}).get('after')
        phases=[('Nominal',result['nominal']),('Last MC',samples[-1]['before'])]
        if final:phases.append(('After compensation',final))
        fig,axes=plt.subplots(len(result['nominal']),len(phases),figsize=(4*len(phases),6.7),layout='constrained',squeeze=False)
        for j,n in enumerate(result['nominal']):
            for col,(title,ms) in enumerate(phases):
                ax=axes[j,col];m=ms[j];artifact=m.get('artifact')
                if not artifact or not (path/artifact).is_file():ax.text(.5,.5,'No grid recorded',ha='center');ax.set_axis_off();continue
                with np.load(path/artifact) as data:
                    g=data['power']
                    if float(g.max())<=0 or 'xMM' not in data:ax.text(.5,.5,'No captured power',ha='center');ax.set_axis_off();continue
                    x,y=data['xMM'],data['yMM'];dx=x[1]-x[0] if len(x)>1 else 1;dy=y[1]-y[0] if len(y)>1 else 1
                    im=ax.imshow(g,origin='lower',extent=[x[0]-dx/2,x[-1]+dx/2,y[0]-dy/2,y[-1]+dy/2],aspect='auto',cmap='viridis',norm=LogNorm(vmin=float(g.max())*1e-4,vmax=float(g.max())))
                    ax.set(title=n['name']+' / '+title,xlabel='Detector local X / mm',ylabel='Detector local Y / mm');fig.colorbar(im,ax=ax,label='Power per pixel (log scale)',shrink=.75)
        fig.savefig(folder/'spots.png');plt.close(fig);result['figures'].append('figures/spots.png')
    # Shared horizontal coordinate: angle sensitivity and power retention together.
    groups={}
    for point in result.get('sensitivity',[]):
        if point.get('phase')=='post-compensation-local':groups.setdefault((point['objectIndex'],point['axis']),[]).append(point)
    for (obj,axis),points in groups.items():
        points=sorted(points,key=lambda p:p['offset'])
        fig,left=plt.subplots(figsize=(9,4.5),layout='constrained');right=left.twinx()
        for j,n in enumerate(result.get('nominal',[])):
            q=[(p['offset'],next((m.get('angleMrad') for m in p['metrics'] if m['name']==n['name']),None)) for p in points]
            q=[(x,y) for x,y in q if y is not None and math.isfinite(y)]
            power=[(p['offset'],next((m['power'] for m in p['metrics'] if m['name']==n['name']),0)/n['power']*100) for p in points]
            if q:left.plot(*zip(*q),'o-',color=colors[j],label=n['name']+' RMS H (left)')
            if power:right.plot(*zip(*power),'s--',color=colors[j],alpha=.75,label=n['name']+' power / nominal (right)')
        left.axvline(points[0]['centerOffset'],color='#7d8790',lw=1,ls=':',label='Final compensation setting')
        left.set(xlabel=f"{axis} compensation offset / {points[0]['unit']}",ylabel='RMS H equivalent angle / mrad',title=f'OBJ{obj} / {axis}: local sensitivity and power')
        right.set_ylabel('Received power / nominal (%)');left.grid(alpha=.2)
        h1,l1=left.get_legend_handles_labels();h2,l2=right.get_legend_handles_labels();left.legend(h1+h2,l1+l2,fontsize=8,loc='best')
        filename=f'figures/sensitivity-energy-obj{obj}-{axis}.png';fig.savefig(path/filename);plt.close(fig);result['figures'].append(filename)

def results_section(result,config):
    def fmt(x):return f'{x:.6g}' if isinstance(x,(int,float)) and math.isfinite(x) else '未记录'
    def table(title,heads,rows):return '<h3>'+escape(title)+'</h3><div class="table-wrap"><table><thead><tr>'+''.join('<th>'+escape(x)+'</th>' for x in heads)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+escape(str(v))+'</td>' for v in row)+'</tr>' for row in rows)+'</tbody></table></div>'
    out='<p>每个MC样本独立扰动，只补偿最后一个样本。星号为最后样本补偿后值；缺光点不以零值补画。</p>'
    for f in result.get('figures',[]):
        label='灵敏度与能量同图：左轴角宽，右轴名义功率保持率，离散采样点连线' if 'sensitivity-energy' in f else 'MC指标散点图' if 'scatter' in f else '名义、末样本与补偿后探测器光斑'
        out+='<figure><img style="width:100%;height:auto" src="'+escape(f,quote=True)+'" alt="'+label+'"><figcaption>'+label+'</figcaption></figure>'
    rows=[]
    for m in result.get('nominal',[]):rows.append([m['name'],fmt(m['rmsMM']),fmt(m['angleMrad']),fmt(m['power']),fmt(m.get('pixelWidthHMM')),m.get('artifact','未记录')])
    out+=table('无公差名义值',['目标','RMS H / mm','等效角宽 / mrad','功率','H像素宽 / mm','光斑数组'],rows)
    rows=[]
    for s in result.get('samples',[]):
        for j,m in enumerate(s['before']):rows.append([s['index'],m['name'],fmt(m['angleMrad']),fmt(s['after'][j]['angleMrad']) if s.get('after') else '未补偿','有效' if s['valid'] else '功率/数据无效'])
    out+=table('MC指标与最后样本补偿',['样本','目标','补偿前 / mrad','补偿后 / mrad','补偿前有效性'],rows)
    comp=result.get('compensation',{});candidate=comp.get('candidate');evidence=comp.get('optimizerEvidence')
    if candidate is not None:
        out+='<p><b>OD/DLS候选复测：'+('已采用' if candidate.get('accepted') else '未采用；保留末MC补偿前位置')+'</b>。行程核验：'+('通过' if candidate.get('inRange') else '越界')+'。</p>'
    if evidence:
        rows=[]
        for stage in ('before','after'):
            e=evidence.get(stage,{})
            for m in e.get('metrics',[]):rows.append([stage,m['name'],fmt(e.get('merit')),fmt(m['angleMrad']),fmt(m['power'])])
        out+=table('优化器内部MFE证据（与脚本独立复测分开）',['阶段','目标','联合MF','MFE角宽 / mrad','MFE接收功率'],rows)
        out+='<p>MFE/NSTR与脚本显式种子的追迹采样不同。同缓存NSDD与数组RMS已核对；最终接受仍须通过脚本固定种子独立复测。</p>'
    chosen=result.get('compensation',{}).get('chosen',[])
    out+=table('最终耦合位置增量',['对象','维度','增量','下限','上限','范围校验'],[[r['label'],r['axis'],fmt(r['delta']),fmt(r['min']),fmt(r['max']),'通过' if r['inRange'] else '越界'] for r in chosen])
    rows=[]
    for s in result.get('sensitivity',[]):
        if s['phase']!='post-compensation-local':continue
        for m in s['metrics']:rows.append([s['label'],s['axis'],fmt(s['offset']),s['unit'],m['name'],fmt(m['angleMrad']),'有效' if s['valid'] else '无效'])
    out+=table('终点局部灵敏度（其他补偿轴固定在最终位置）',['对象','轴','相对名义补偿量','单位','目标','角宽 / mrad','有效性'],rows)
    for k,label in [('lastMCModel','最后MC副本'),('finalModel','最终补偿副本')]:
        if result.get(k):out+='<p><a href="'+escape(result[k],quote=True)+'">'+label+'</a></p>'
    return out
