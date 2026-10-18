"""从明确白名单导出公共文本快照与官方Preset；不修改用户中心。"""
from pathlib import Path
import json,hashlib,re,textwrap
ROOT=Path(__file__).resolve().parents[3]
PACKAGE=ROOT/'plugins/optdsh-experts'
template=(ROOT/'node_modules/@deepseek-ai/dsh-web-app/presets/standard.patch.yml').read_text(encoding='utf-8')
rows=['        - id: optdsh-expert-resources\n          name: ./lib/index.js']
roster=[]
for name in ['visual-designer','software-architect']:
 source=(ROOT/'.agents/experts'/name).resolve()
 meta=json.loads((source/'agent.json').read_text(encoding='utf-8'))
 manifest=json.loads((source/'resources.json').read_text(encoding='utf-8'))
 target=PACKAGE/'resources'/name
 target.mkdir(parents=True,exist_ok=True)
 copied={}
 names=['instructions.md']+[p for p in manifest['files'] if Path(p).suffix in {'.md','.json','.py','.toml'} and p.startswith(('library/','kit/')) and 'private' not in Path(p).parts and 'preferences' not in p]
 for item in names:
  path=(source/item).resolve()
  if not path.is_relative_to(source):raise ValueError('Resource escaped source')
  text=path.read_text(encoding='utf-8')
  text=re.sub(r'!?\[([^\]]*)\]\(([^)]+\.(?:png|jpg|webp))\)',r'\1（公共包未附原图，请查看来源链接）',text)
  output=target/item;output.parent.mkdir(parents=True,exist_ok=True);output.write_text(text,encoding='utf-8')
  copied[item]=hashlib.sha256(output.read_bytes()).hexdigest()
 (target/'resources.json').write_text(json.dumps({'schema_version':2,'files':list(copied)},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 (target/'snapshot.json').write_text(json.dumps({'name':name,'version':meta['version'],'privateIncluded':False,'files':copied},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 body=(target/'instructions.md').read_text(encoding='utf-8')
 body=body.replace('{{RESOURCE_ROOT}}',f'专家{name}的library资源').replace('{{KIT_ROOT}}',f'专家{name}的kit资源')
 body+=f'\n\n通过 expert_resource(expert="{name}", resource="library/START.md") 按需读取随包参考；kit资源使用kit/前缀。当前Workspace的AGENTS/README通过官方文件工具读取。公共包不含私人偏好或参考截图，缺图时请报告实际限制。继承父会话的模型与权限，不自动切换模型。'
 preset='optdsh-'+name
 part=template.replace('preset-standard', 'preset-'+preset,1).replace('        id: standard\n',f'        id: {preset}\n        name: '+json.dumps(meta['title'],ensure_ascii=False)+'\n        description: '+json.dumps(meta['description'],ensure_ascii=False)+'\n',1)
 signature='              prefix: You are a coding agent powered by the {{model}} model.'
 if part.count(signature)!=1:raise ValueError('Official Standard persona changed')
 part=part.replace(signature,'              prefix: '+json.dumps(body,ensure_ascii=False))
 part=textwrap.dedent(part.split('- insert:\n',1)[1])
 rows.append(textwrap.indent(part.rstrip(),'        '))
 roster.append({'name':name,'preset':preset,'title':meta['title'],'description':meta['description'],'tool':'expert_'+name.replace('-','_')})
for expert in roster:
 rows.append('        - id: '+expert['tool']+'\n          name: "@deepseek-ai/dsh-tool-subagent"\n          config:\n            provider: spawn\n            toolName: '+expert['tool']+'\n            agentPreset: '+expert['preset'])
(PACKAGE/'resources/experts.json').write_text(json.dumps(roster,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(PACKAGE/'cordis.patch.yml').write_text('- insert:\n    - id: optdsh-experts\n      name: cordis:group\n      group: true\n      config:\n'+'\n'.join(rows)+'\n',encoding='utf-8')
print('Built 2 public expert snapshots and official Presets; no global writes')
