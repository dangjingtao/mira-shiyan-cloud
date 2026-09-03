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

## LLM 整理与 AI / Final Draft（MOB-020）

### 整理链路

Capture Workflow 在 `persist-transcript` 之后继续执行：

```text
organize（调用 shiyan-llm 生成结构化 JSON + Markdown AI Draft）
  -> persist-ai-draft（D1 持久化并把任务置为 ready）
```

- Transcript 是只读证据层，organize / AI 调整 / Final Draft 均不写 `transcripts`。
- `shiyan-llm` 只通过 Service Binding 调用，不接触 D1，不解释 CaptureTask 状态。
- 结构化输出必须通过服务端校验；校验失败返回带路径的可诊断错误，绝不把非法 JSON 当成功。
- Destination 直接消费已生成的 Markdown，不会再次调用 LLM 重新解释内容。

### Provider 与 fallback

任意 OpenAI 兼容 chat completions Provider 均可接入，一次调用只配置一个 primary + 一个 fallback：

```text
LLM_PRIMARY_PROVIDER / LLM_PRIMARY_BASE_URL / LLM_PRIMARY_MODEL    # vars
LLM_PRIMARY_API_KEY                                                # secret
LLM_FALLBACK_PROVIDER / LLM_FALLBACK_BASE_URL / LLM_FALLBACK_MODEL # vars
LLM_FALLBACK_API_KEY                                               # secret
LLM_TIMEOUT_MS                # optional, default 120000
LLM_MAX_TRANSCRIPT_CHARS      # optional, default 200000
```

Secret 注入：

```bash
wrangler secret put LLM_PRIMARY_API_KEY --config wrangler.llm.jsonc
wrangler secret put LLM_FALLBACK_API_KEY --config wrangler.llm.jsonc
```

Fallback 规则：

- 仅当 primary 出现明确可重试错误（429 / 5xx / 网络错误 / 超时）或 primary 未配置 Key（Provider 不可用）时切换到 fallback。
- 输入 / prompt / schema 错误（HTTP 400、401/403、非法 JSON、结构化校验失败）是 terminal 错误，不会触发 fallback，也不被 fallback 吞掉。
- 错误信息统一归一，不包含上游原始 body、API Key 或完整 Transcript。

每次整理 / 调整记录 provider、model、latency、usage（Provider 支持时）、provider request id、是否 fallback、correlation id（`drafts` 表）；失败类别记录在对应 stage 的 `error_code`。

### 场景（Scene）

三个内置场景（`meeting` / `quick-note` / `reflection`）由代码提供稳定输出结构；会议场景覆盖摘要、关键决策、待办事项、风险 / 阻塞、待确认问题。

自定义场景只消费「名称 + 整理要求 + 输出结构」：

```text
POST /v1/scenes    { id, name, instruction, sections: [{ id, title, description }] }
GET  /v1/scenes
```

- 内置场景 id 保留，不可被自定义场景占用。
- 完整系统 Prompt 由服务端固定组合，普通用户不可注入。
- 场景按设备隔离（`scenes` 表，主键 `device_id + id`），同 id 同内容幂等，内容漂移返回 409。

### API（设备鉴权后）

```text
GET  /v1/capture-tasks/{taskId}/ai-draft            # 最新 AI Draft
POST /v1/capture-tasks/{taskId}/ai-draft/adjust     # AI 调整（可多次，幂等键保护）
     { instruction, idempotencyKey }
POST /v1/capture-tasks/{taskId}/organize/retry      # 只重跑 organize，不重跑 STT
GET  /v1/capture-tasks/{taskId}/final-draft         # 当前 Final Draft
PUT  /v1/capture-tasks/{taskId}/final-draft         # 保存 / 确认人工最终稿
     { markdown, title?, baseVersion? }
```

### AI Draft / Final Draft 存储合同

`drafts` 表（migration `0005_llm_organization.sql`）是拾言内容合同：

- `kind='ai'`：organize 生成 version 1，之后每次 AI 调整追加 version N+1（`source='adjust'`，带幂等键与调整指令）。AI 只追加，永不覆盖。
- `kind='final'`：用户人工最终稿，单工作态（version 1，upsert）。只有用户通过 `PUT final-draft` 写入；任何 AI 路径都不写 `kind='final'`，后台不会静默覆盖人工内容。
- Final Draft 行携带 `title / markdown / confirmed_at`，即 MOB-022 delivery 层消费的 `ConfirmedFinalDraftSnapshot`；投递不信任客户端直接提交的 Markdown。
- Final Draft 保存要求已存在 AI Draft（`final_draft_requires_ai_draft`）；保存后再次 AI 调整只会生成新的候选 AI Draft 版本。
- 保存 Final Draft 会把任务 lifecycle 从 `ready` 推进为 `completed`（单次确认，幂等）；migration `0006_final_draft_lifecycle_backfill.sql` 回填历史已确认但仍停留在 `ready` 的任务（issue uichat-mira-mobile#95）。

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

MOB-022 只消费服务端已经确认的 Final Draft 快照；`deliverConfirmedFinalDraftToGithub` 等 `deliver` 公开路由接线在 MOB-020 Final Draft 存储合同合入后由 MOB-022 后续启用，不回退为客户端直投任意 Markdown。

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
