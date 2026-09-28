# Rx收光效率与FOV扫描

把已建模型作为固定试验台，按两个控制量的笛卡尔积逐点追迹。沿用N02的测量原理，配置与执行器已适配optDSH；实例2的真实宿主扫描验收见planning/STATUS.md。

## 先理解任务

1. 读取所选Study的README和当次配置；本Skill承载执行流程，术语与物理H/V遵循[2t2rLidar领域契约](../../../../docs/2t2rLidar/README.md)。同时遵守[数据契约](../../../../docs/contracts.md)与[公共run规范](../../../../docs/runs-and-reports.md)。
2. 先只读inspect当前目标模型：文件、modelId/revision、对象type/comment、局部控制角、pickup、Source Rectangle功率/半宽/分析光线、detector口径/像素与其他发光源。工作台快照提供身份和几何，不能代替完整源/pickup检查。
3. 向专家解释匹配与失配，确认H/V角度、归一化最大面积、各探测面语义与光路。针对新模型或实质修改交互逻辑，必须在inspect后至少取得一次确认；只读探索和通用移植不要求绑定活动模型。
4. 优先使用用户当次提交或指定的配置；尚无配置才从[YAML样例](../config/rx-scan.example.yaml)创建Study内新文件，不能用样例覆盖已提交值。对象号与参考面积的样例值未经确认，历史对象号或1020 mm²也不能自动套用；用户明确确认沿用的值保持不变。执行器只接受积分通量，不能把hits/peak当功率效率。

先读已知配置与结构化检查结果，缺什么再定向查询；不为列出已有字段反复调用对象详情或遍历历史run。快照可能过时，当前身份/源状态以只读预检为准。缺失的研究参数单独列出，不由Agent补一个“合理值”。

## 计算口径

```text
actual = initial + delta
angle_H = scanner_h_actual × H.scale + H.offset_deg
angle_V = echo_v_actual × V.scale + V.offset_deg
A_source = 4 × x_half_width_mm × y_half_width_mm
P_norm = P_source × max_receive_area_mm2 / A_source
flux_X = GetDetectorData(detector, 0, 0, 0) 的积分通量
eff_X = flux_X / P_source
norm_eff_X = flux_X / P_norm
near_rx_over_mirror = flux_near_rx / flux_mirror
```

三种面积分别记录，禁止互相替换：

| 量 | 依据 | 用途 |
|---|---|---|
| 源面积 A_source | 当前Source Rectangle半宽，执行器计算4xy | 把源功率折算为参考面积上的功率 |
| 参考面积 max_receive_area_mm2 | 当次用户提交/明确确认的Study定义 | 归一化分母；注明来源配置与确认依据 |
| 探测器矩形面积 | 当前Detector Rectangle半宽，4xy | 描述探测面几何，不自动成为参考面积 |

例如半宽8.2×15 mm的矩形面积是492 mm²，不是246 mm²。源半宽30×20 mm对应2400 mm²；这也不意味着参考面积必须改成2400。优先引用执行器的`areaMM2`和`normalizationPowerW`并用确定性计算复核，避免口算重写配置。校验器检查参考面积为正，**不证明其物理定义或用户确认正确**。若用户配置与旧run不同，列出差异和依据，不静默回填历史值。

当前2t2rLidar研究的控制角关系已由用户确认，见[H/V约定](../../../../docs/2t2rLidar/angles.md#5-当前控制角映射用户已确认)；保持该映射时不重复要求确认，实际系数和零位仍写入当次YAML。其他模型另按其证据确定。
转镜参考面用于区分入射截获变化与后续Rx传输；SPAD是另一独立观测面，不自动代表PDE或电学响应。
零/无效分母记null；面积归一值可能超过1，保留数值并解释，不能截断成100%。没有时间定义就不能称为脉冲能量。

## 配置与命令

用户希望通过界面填写、或不想手改 YAML 时，可用[表单填写入口](form-input.md)从现有配置直接创建临时表单，再读取已提交结果并导出新 YAML。此步骤仅收集配置；不连接模型、不生成 run，也不代替以下预检与执行确认。

使用`config/optics.local.json`中记录的隔离Python解释器（须有现有numpy/PyYAML/pythonnet）。从项目根执行：

```powershell
$py = (Get-Content config/optics.local.json -Raw | ConvertFrom-Json).python
$entry = '.agents/skills/optdsh-rx-collection-efficiency/scripts/scan.py'
& $py $entry STUDYS/2t2rLidar/configs/rx-scan.local.yaml
& $py $entry STUDYS/2t2rLidar/configs/rx-scan.local.yaml --dry-run
# 专家审阅dry-run后，填入expectedInspectionDigest和expertConfirmation再执行：
& $py $entry STUDYS/2t2rLidar/configs/rx-scan.local.yaml --execute
```

- 默认命令仅离线计划，绝不连接Zemax；`initial: null`在计划中保留未解析，dry-run才读取真实初值。
- `deltas`与`range: {start, stop, num}`必须二选一；range包含端点，禁止重复点。控制角为对象局部deg，模型长度必须mm。每轴最多1000点，总计最多10000点。
- 真实连接要求非占位modelId/expectedRevision、精确type/comment；桥接配置绑定文件与extension实例。`--dry-run`只读、不创建副本、不清detector、不打开trace、不做恢复写入。
- dry-run生成`model_inspection.json`中的inspectionDigest；执行前专家确认并填入配置。后续模型或相关检查字段变化会拒绝执行。已确认同一配置不反复索要许可。

## 连接与当前兼容限制

本Skill经`packages/optics`直连ZOS-API，不经光学工作台HTTP执行扫描。`--bridge-config`当前只是连接配置入口，需backend、实例和绑定文件等数据；迁移还需光学公共包、Python依赖及有效本地配置，不能宣称单独复制Skill目录即可运行。

当前`scan.py`在真实预检/扫描前仍检查桥接监听端口（默认3081），监听即拒绝；还使用项目内`.runtime/tx-pilot.lock`。这是现实现制，不证明服务一直占用ZOS，也不是所有ZOS Skill应遵循的通用协议。

遇到`Optics bridge is running`：保留失败run，说明端口门禁阻塞；可以继续离线核对配置。不要从DSH的pwsh工具自动组合“停服务→扫描→恢复”，不要强杀其他作业或绕过门禁。已有用户授权且有经验证的宿主外服务管理入口时，才由该入口协调并恢复原状态；否则明确待外部协调。DSH Windows Job会等待常驻子进程，`Start-Process`、完全权限或增大超时都不能据此保证工具返回。不能把停止Agent当停止仿真。

后续目标是工作台保持运行、公共ZOS层按实际API实例协调访问，冲突时明确busy、缓存仍可看；替换端口门禁后再简化此段。目前尚未实现跨项目实例锁或完成服务共存验收，不要求业务Skill调用工作台启停接口。

## 执行及恢复边界

正式执行只修改独立`CopySystem`，每点控制写入后回读、清detector、固定种子追迹、检查Succeeded、读取全部探测面。源尺寸/功率在扫描中变化会停止。默认其他源存在非零分析光线会阻塞。专家明确确认后可配置`copySourcePreparation`：指定回波源analysisRays及带精确type/comment的disableSources。仅在副本把这些光线数单元格的ObjectPickup转为Fixed，设置并回读，其他solve类型拒绝；不改源功率，不改主模型pickup。预检记录原状态与solve指纹，报告记录副本实际光线数。

正常、异常、取消均关闭trace与副本；原模型不保存、不备份写盘、不执行“恢复到YAML初值”。核对主系统ID、dirty标志、磁盘SHA256、快照及工作流检查字段；失败标verification-failed，保留证据并请专家核对。此检查不是全宿主状态的原子证明。

在当次run创建空`cancel.request`可在点间取消；已开始的单点追迹需等待。强杀进程可能留下未完成run，不能当completed或确认恢复。

## 交付

每次调用在配置所属Study内分配`runs/rx-fov/YYMMDD-NN/`，项目外配置默认使用根runs（可显式--runs-root覆盖），保留原始YAML、实际JSON配置、计划、模型检查、状态、逐点CSV、`matrices.npz`、轴与指标索引、离线HTML和SHA256清单。执行只消费冻结配置。

报告顺序为研究背景→Setup→结果解释→证据限制；矩阵行V/列H，效率热力表色标固定0–1，原始值不裁剪。不需要matplotlib；图表直接内嵌HTML，可离线打开。中途失败保留已完成点，未测点为NaN/破折号。

回复明确区分：离线计划、只读预检、模拟测试、真实追迹。迁移测试通过不代表真实Zemax或glm-5.3-flash产品端已验证。不要为了实测切换模型或恢复旧headless路径。

## 结果与耗时验收

- 以最终`result.json`、进程结果和恢复审计判断完成；预检过程中的`model_inspection.json`可能保留初始状态，不单凭该字段判失败。报告主模型检查、副本关闭及cleanupErrors，和数值结论分开。
- 从逐点CSV/JSON复算归一化、百分比和比值范围；仅在探测面构成对应嵌套光路时检查通量逐级不增。归一化超过1先查分母定义，不裁剪，也不直接称为能量不守恒。
- 小扫描只证明执行路径。需要定量结论时，在授权范围内用少量重复点检查一致性；异常时先保留证据并限制结论，不自动扩大扫描。声明同seed不证明实际随机流相同；没有命中数/权重方差与受控对照，不断言噪声、几何或扫描顺序是根因。不同revision、源状态、采样与定义的历史run不作直接因果对比。
- 时间取自工具/执行器记录，分开列端到端墙钟、模型耗时、工具耗时、脚本耗时和扫描循环；缺失项写未记录。工具等待服务退出不能算Zemax计算时间。监督器修改配置、处理生命周期或纠正结果均应披露，不能称完全自主成功。
