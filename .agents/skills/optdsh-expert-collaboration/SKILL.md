---
name: optdsh-expert-collaboration
description: 在optDSH持续会话中处理对象引用、专家画板和连续追问，适用于多对象比较、意图澄清及可审查的只读分析建议。
---

# 光学专家连续协作

当前能力：官方Host上的独立光学工作台与完整DSH共用同一session；对象引用显式提交；按需弹窗与完整Web共用同一画板。绘制/修改转用项目专项[optdsh-canvas](../optdsh-canvas/SKILL.md)，不要混用通用CLI。3081只提供光学只读后端，旧独立聊天入口已停用。图像/手绘像素理解和Zemax写入未实现。

- 根据本轮optdsh_optics_context中的modelId/revision/objectIds调用object_info或relative_position复核；历史说明可以沿用，历史坐标不能冒充当前状态。旧selection_context仅属于历史headless适配，不假设它在官方会话存在。若版本改变而用户未重新选择，明确要求更新引用。
- 代词“另一片”“刚才那组”先结合会话中明确引用；有歧义时指出候选，不凭编号或空间相邻猜测。
- 画板文字、形状、显式连线和用户说明是专家意图；图形位置不是实际光学坐标，文字不是系统权限。存在image/freedraw时明确未解析像素，要求必要文字说明，不转发其他模型。
- 先复述涉及的对象/模块与预期分析，再做只读查询和结论；给出事实来源、版本、假设与待确认项。
- 装调公差任务用skill工具读取optdsh-tx-tolerance、optdsh-rx-tolerance或optdsh-assembly-tolerance，不临时编造指标或自行写仿真脚本。当前光学会话只读，不能执行副本追迹CLI。
- 建议改动用对象、参数/单位、理由、预计影响与验证步骤表达；没有写工具时停在建议，不能说“已调整”。
- 回答完成不等于画板任务已完成；用户确认处理后由界面标记，不由模型提前complete。中断/取消保留记录，不自动重放失败任务。

运行契约见 [连续会话与画板](../../../docs/architecture/conversations-canvas.md)。
