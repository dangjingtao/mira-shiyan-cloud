# Mira Shiyan Cloud

拾言（Shiyan）的云端实现仓库。

## 唯一真相

本仓库**不是**拾言产品与跨仓库合同的真相源。

唯一真相位于：

`dangjingtao/uichat-mira-mobile` → `docs/shiyan/README.md`

Canonical URL：

https://github.com/dangjingtao/uichat-mira-mobile/blob/dev/docs/shiyan/README.md

本仓库只负责实现该真相中已经确认的云端职责，包括但不限于任务持久化、对象存储、STT、轻量 LLM 服务层与 Destination Adapter。

## 一致性规则

任何涉及以下内容的修改，必须先阅读 Mobile canonical spec：

- CaptureTask / Stage 状态语义
- Transcript / Draft / Final Draft 边界
- API 与关键数据合同
- STT / LLM Provider 边界
- Destination 行为
- Mobile / Desktop 职责

修改完成后必须重新对照 canonical spec 做一致性检查。

如果实现需要改变产品行为或跨仓库合同，**先修改并评审 Mobile 的 `docs/shiyan/README.md`，再修改本仓库**。

禁止因为“云端已经这样实现”而反向覆盖产品真相。

## 工程取舍

具体 API 路径、D1 表结构、音频切片参数、第三方库与部署细节，由本仓库根据以下优先级自行决定：

1. 稳定性
2. 落地成本
3. Debug 成本
4. 性能与扩展性

在不违反 canonical spec 的前提下，优先选择简单、可观察、容易恢复的实现。
