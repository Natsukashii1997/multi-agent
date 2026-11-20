# 多 Agent 协同 协作约定（Codex / Claude 必读）

跨项目复用的多 Agent 协同模式：思维评审、工程审查、独立验证、并行研究、自治委派等模式的契约、角色协议、接力约定与模式评测；模式可由 Claude / Codex 自行启动，也可由 Hermes 等主控调用。进入顺序：本文件 → [CURRENT.md](CURRENT.md)（当前状态与唯一下一步）。需求以 《V1.3 架构定稿》（`/Users/nat/Documents/ChatGPT/个人/work/digital-twin/docs/项目体系重构/2026-11-07-V1.3-ChatGPT架构定稿与工程推进令.md`） 为准。所有面向用户的文字用简体中文。本文件只放怎么开始和做什么事之前读哪份；操作细节在 [docs/OPERATIONS.md](docs/OPERATIONS.md)，按需读对应一节。

## 边界（V1.3 第 3 节，2026-11-07 冻结）

| 归属 | 管什么 |
|---|---|
| **本仓库** | 协同模式契约（目标、适用/禁用条件、角色职责、输入与交接物、成功与停止条件、轮次/超时、证据来源、人工必须决定的事项）、模式评测 |
| digital-twin（DT-ORC） | Hermes 控制面、run 授权、任务调度、Hermes→Multica 适配代码、Multica 实施；它引用本仓库的模式契约，不另写一份 |
| my-skills | `thinking-review` 等可执行方法的正式代码与版本；本仓库只登记 skill 引用，不复制正文 |
| 驿窗 postpane | 接力的界面、传信、回执与会话导航，不拥有模式定义 |
| agent-kit | 跨项目安全、权限、可追溯底线；模式契约按风险继承，不得放宽 |

Multica 是当前采用的执行编排技术（外部依赖），不因本项目存在就把上游引擎或沙盒代码搬进来。起步只从 `thinking-review` 和一次真实工程审查接力各反推一份契约，不先造空模板。

## 做什么事之前读哪份

| 要做的事 | 先读 |
|---|---|
| 改需求、加功能 | 《V1.3 架构定稿》（`/Users/nat/Documents/ChatGPT/个人/work/digital-twin/docs/项目体系重构/2026-11-07-V1.3-ChatGPT架构定稿与工程推进令.md`） |
| 排障、改脚本、装 launchd 或定时任务 | 先 `grep -n 关键词 docs/LESSONS.md`，再搜全局坑 `/Users/nat/Documents/ChatGPT/个人/work/agent-kit/LESSONS.md` |
| 开需求、拆任务、实现、审查 | 下面「Agent skills」一节 |
| 写交接、验收别人的交接 | [docs/templates/handoff.md](docs/templates/handoff.md) 骨架；[OPERATIONS](docs/OPERATIONS.md)「交接写法」「报告与验收」 |
| 用某个协同模式、改模式契约 | `modes/` 下对应契约（目前 [MA-01 思维评审](modes/MA-01-thinking-review.md)、[MA-02 工程审查](modes/MA-02-engineering-review.md)）；可执行步骤以 my-skills 为准 |
| 选模式：这件事要不要协同、用哪个模式 | [docs/routing.md](docs/routing.md) |
| 选 Agent：谁来承担哪个角色、现在谁可用 | [docs/agent-profile.md](docs/agent-profile.md)；用前跑 `node scripts/probe-agents.mjs` |
| 试跑候选模式（MA-03～06） | [docs/candidates.md](docs/candidates.md) |
| 记一次协同运行 | [docs/runs.md](docs/runs.md)，记进 `runs/runs.jsonl` |
| 查候选模式全景、为什么这样定 | [docs/design/2026-11-07-V1.0修订表.md](docs/design/2026-11-07-V1.0修订表.md)（取代 V1.0 冲突条款）；原文与决策记录在 `docs/design/` |

项目长出接口、样式、发布等文档后，在这张表里加一行。

## 分工

- 以用户每轮明确授权的范围为准；授权外的不做。
- 一次只做一件授权的事；范围外的问题记进交接，不顺手修。
- 并行的会话各开独立 worktree，不在同一目录改代码；做不到时照全局坑 G-04，只提交自己的改动。

## 运行

```sh
node --test tests/*.test.mjs     # 交接格式 + 通用规则（含自测）
node scripts/check-rules.mjs     # 只跑通用规则检查
git config core.hooksPath scripts/hooks   # 装提交、推送前的必经检查（每个克隆、每台电脑各一次；不用 --no-verify 绕过）
node scripts/probe-agents.mjs    # Agent 动态档案：额度、在线、Hermes 与 Codex 是否同一账号（只读，不耗额度）
```

## 结构

```
AGENTS.md            入口（本文件）
CURRENT.md           当前状态与唯一下一步；每轮交接写在顶部
modes/               模式契约（只放已有真实运行的模式；候选模式不建空文件）
runs/runs.jsonl      所有模式共用的运行记录（字段见 docs/runs.md）
docs/
  routing.md         场景路由：遇到什么事用哪个模式
  agent-profile.md   协作角色与 Agent 能力档案
  candidates.md      候选模式卡（MA-03～06）
  runs.md            运行记录字段说明
  design/            设计与评审：V1.0 候选全景、修订表、决策记录
  agents/            Matt Pocock 技能读的约定：issue 看板、分流标签、领域文档
  LESSONS.md         本项目的坑（排障、改脚本前先搜）
  OPERATIONS.md      操作手册：交接写法、报告与验收
  templates/handoff.md  交接一节的骨架
scripts/
  check-rules.mjs    通用规则检查（只查机器能判定的）
  probe-agents.mjs   Agent 动态档案探测
tests/               node:test 测试
```

## Agent skills

开发流程用 Matt Pocock skills（`~/.agents/skills/`）：大活走 `to-spec` → `to-tickets` → `implement` / `tdd` → `code-review` → PR；小改（一张 issue、一天内做完）跳过 `to-spec`。Claude 用 `/技能名`，Codex 用 `$技能名`；这几个技能只在点名时加载，不会自动触发。

### Issue tracker

需求、规格与任务用本仓库 GitHub Issues。见 `docs/agents/issue-tracker.md`。

### Triage labels

五个默认分流标签。见 `docs/agents/triage-labels.md`。

### Domain docs

single-context：根目录 `GLOSSARY.md` 与 `docs/adr/`，用到时再建。见 `docs/agents/domain.md`。

改动怎么走、分支怎么起名、交接写在哪、怎么合并：见 `/Users/nat/Documents/ChatGPT/个人/work/agent-kit/工程流程.md`。

## 规则

- 验证用的备份、日志等证据放 `~/Library/Application Support/multi-agent/evidence/`，不放 `/tmp`（全局坑 G-01）；私人数据与完整日志不进仓库。
- 本机服务只监听 127.0.0.1；新增依赖先改 `scripts/check-rules.mjs` 的 `ALLOWED_DEPS`，并在交接里说明理由（`check-rules` 会查）。
- 页面上的时间经统一的格式化函数按北京时间显示，不直接截取 ISO 字符串（全局坑 G-02，`check-rules` 会查）。

## 交接格式

每轮完成后，在 CURRENT.md 顶部新增一节（旧节保留在下面，过长时归档到 `docs/history/`），骨架照抄 [docs/templates/handoff.md](docs/templates/handoff.md)；`tests/handoff-format.test.mjs` 会检查顶部一节有没有日期、「时间：开工」「测试：」「本轮新坑：」三行，新坑编号在 LESSONS 里要存在。每一行怎么写、报告与验收的防伪造五条见 [OPERATIONS](docs/OPERATIONS.md)「交接写法」「报告与验收」；没做就写「未做」。
