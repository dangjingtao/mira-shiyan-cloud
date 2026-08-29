# Mira Shiyan Cloud

拾言（Shiyan）的云端实现仓库。

## 唯一真相

本仓库**不是**拾言产品与跨仓库合同的真相源。

唯一真相位于 `dangjingtao/uichat-mira-mobile` 的 `dev` 分支：

- 产品基线：`docs/shiyan/PRD.md`
- 技术基线：`docs/shiyan/TECHNICAL_DESIGN.md`
- 跨仓库治理：`docs/shiyan/README.md`
- GitHub Destination 合同：`docs/shiyan/GITHUB_DESTINATION_CONTRACT.md`

Canonical directory:

https://github.com/dangjingtao/uichat-mira-mobile/tree/dev/docs/shiyan

本仓库只负责实现 Mobile canonical truth 已确认的云端职责。

当前技术基线明确：

- 一个 cloud repo，不再拆仓。
- `shiyan-api`：产品业务、设备鉴权、任务、D1/R2、Workflow、Destination。
- `shiyan-llm`：私有轻量 LLM 服务层，通过 Service Binding 调用；保管 Provider Key、基础 fallback 和错误归一，不解释 CaptureTask 业务状态。
- D1 为服务端事实数据库，R2 保存大对象 / 原始资产。
- GitHub / Notion 等是 Destination，不是数据库。
- 阶段失败不得粗暴映射成“整个任务失败”。

## GitHub Destination 配置

MOB-022 默认目标为 `dangjingtao/mira-shiyan`。GitHub credential 必须作为 Cloud Secret / 等价安全配置提供，不能写入仓库、返回 Mobile 或记录在普通日志中。

实现使用以下配置名：

```text
GITHUB_DESTINATION_TOKEN        # required secret
GITHUB_DESTINATION_OWNER        # optional, default dangjingtao
GITHUB_DESTINATION_REPOSITORY   # optional, default mira-shiyan
GITHUB_DESTINATION_BRANCH       # optional, default main
GITHUB_DESTINATION_ROOT         # optional, default entries
```

MVP credential 应限制为目标仓库所需的 Contents 写权限。正式路径、Frontmatter、幂等与冲突语义以 Mobile canonical `GITHUB_DESTINATION_CONTRACT.md` 为准。

MOB-022 只消费服务端已经确认的 Final Draft 快照。MOB-020 的 Final Draft 存储 / 确认合同未合入前，不以客户端直接提交任意 Markdown 的方式绕过该前置条件。

## 一致性规则

涉及以下内容的修改，必须先阅读 Mobile canonical spec：

- CaptureTask / Stage 状态语义
- Transcript / Draft / Final Draft 边界
- API 与关键数据合同
- STT / LLM Provider 边界
- Destination 行为
- Mobile / Desktop 职责

修改完成后必须重新对照以下顺序做一致性检查：

1. `PRD.md`
2. `TECHNICAL_DESIGN.md`
3. `README.md`
4. `GITHUB_DESTINATION_CONTRACT.md`（涉及 Destination 时）
5. 本仓库实现与测试
6. `dangjingtao/mira-shiyan` Destination 边界

如果实现需要改变产品行为或跨仓库合同，先修改并评审 Mobile canonical truth，再修改本仓库。

禁止因为“云端已经这样实现”而反向覆盖产品真相。

## 工程取舍

局部实现细节按以下优先级自行决定：

1. 稳定性
2. 落地成本
3. Debug 成本
4. 性能与扩展性

在不违反 canonical spec 的前提下，优先选择简单、可观察、可恢复的实现。
