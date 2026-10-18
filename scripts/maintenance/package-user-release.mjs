import {existsSync,readFileSync,mkdirSync,cpSync,copyFileSync,writeFileSync,realpathSync} from 'node:fs';
import {resolve,relative,sep,join} from 'node:path';
import {createHash} from 'node:crypto';
const source=resolve(process.argv[2]||''),output=resolve(process.argv[3]||'');
if(!process.argv[2]||!process.argv[3]||existsSync(output))throw Error('Provide a release and a new user-package directory');
if(output===source||output.startsWith(source+sep))throw Error('User package must be separate from the build directory');
const manifest=JSON.parse(readFileSync(join(source,'release-manifest.json'),'utf8'));
const executable=resolve(source,manifest.installer.file);
if(createHash('sha256').update(readFileSync(executable)).digest('hex')!==manifest.installer.sha256)throw Error('Installer hash mismatch');
mkdirSync(output,{recursive:true});
cpSync(source,join(output,'_support'),{recursive:true,filter:path=>{
 const parts=relative(source,path).split(sep);return parts[0]!=='logs'&&parts[0]!=='.runtime'&&realpathSync(path)===resolve(path);
}});
copyFileSync(executable,join(output,'安装optDSH.exe'));
writeFileSync(join(output,'使用说明.txt'),`optDSH ${manifest.version} 本地验收版\r\n\r\n1. 双击“安装optDSH.exe”，按图形向导选择程序、资料和课题位置，无需输入命令。\r\n2. 安装后双击程序目录“optdsh.exe”启动；双击“卸载optDSH.exe”选择卸载项目。课题永远不在卸载范围内。\r\n3. _support是随包安装资源，请保持与安装EXE在同一目录，不必打开或逐个操作。\r\n4. Node.js 24+是前置；Python/Zemax按光学功能另行准备。软件不携带账号、密钥、会话或商业模型。\r\n5. 端口冲突由安装器检测并避让，结果见安装目录PORTS.md。已有资料与全局.agents不会被覆盖或回收。\r\n\r\n内部构建与源码：${manifest.sourceRevision}\r\n程序未签名；开发预览版请先在新的程序目录与测试Home中人工核验。\r\n`,'utf8');
console.log(JSON.stringify({version:manifest.version,output,entry:'安装optDSH.exe',layout:['安装optDSH.exe','使用说明.txt','_support']}));
