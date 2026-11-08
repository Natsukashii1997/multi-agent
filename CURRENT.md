# 当前状态

更新：2026-11-08。MA-01、MA-02 契约在 `modes/`，MA-02 已在四处对齐，新规则下有 L1、L3 各 1 次真实运行。批 A 配套设施（#4）已做完、待送审：场景路由 `docs/routing.md`、能力档案 `docs/agent-profile.md` + 探测脚本 `scripts/probe-agents.mjs`、候选卡 `docs/candidates.md`、运行记录 `runs/runs.jsonl`。Codex 额度已核实可用，且与 Hermes 共用。唯一下一步：#4 的 PR 送 ChatGPT 审 1 轮（L1）并收口，常浩说「合并」后合并；随后做 agent-kit 全局路由一行（另开单），再进批 B：MA-03 首次试跑并进一个真实 L2/L3 工程任务。

## 批 A：多 Agent 协同配套设施（2026-11-08，Claude，常浩回复「按推荐，开工批 A」「按计划开工」；已提交、待送审，无需发布）

- 时间：开工 `2026-11-08 16:04`（`date '+%F %H:%M'` 记录）。来由：常浩要求把其余模式的 skill 和配套设施搭出来；按评审结论不建空 Skill，先搭配套设施（#4）。
- 改了哪些文件：
  - `scripts/probe-agents.mjs` + `tests/probe-agents.test.mjs`：只读探测 Claude/Codex 额度（驿窗快照）、Codex 登录、驿窗、Hermes 网关、Hermes 与 Codex 是否同账号（只比哈希）；超 24 小时标「未核实」；
  - `docs/agent-profile.md`：六角色、长期档案、独立性约束、动态条件指向脚本；
  - `docs/routing.md`：10 个核心场景到模式的路由，其余 6 个场景的归类；
  - `docs/candidates.md`：MA-03～06 候选卡，试跑做法与可判定的晋升条件；
  - `runs/runs.jsonl` + `docs/runs.md` + `tests/runs-format.test.mjs`：统一运行记录，回填 8 条；
  - `modes/MA-02-engineering-review.md`：状态行与第 10 节改为四处已对齐，第 7 节补 M5 #93、月度用户策略批 0；
  - `docs/design/2026-11-07-V1.0修订表.md`：第 4 节指向候选卡，「仍未核实」两条改为已核实；
  - `AGENTS.md`：导航表 4 行、运行命令、结构。
- 测试：`node --test tests/*.test.mjs` 原样结果 `ℹ pass 11` / `ℹ fail 0`；`node scripts/check-rules.mjs` 输出 `通用规则检查通过`。
- 验证：`node scripts/probe-agents.mjs` 本机实跑六项（2026-11-08 16:05），结果写在 agent-profile 第 4 节；测试先抓到一个真缺陷（「Not logged in」被当成已登录），已修。runs.jsonl 每条对过驿窗 `handoffs.json`（轮次、verdict、时间）与 PR（digital-twin#93、niuma-home#23 的状态和正文）。
- 截图：无。
- 发布与回读：无需发布。
- 与授权不一致之处、遗留问题、范围外发现：
  - 计划里「回填 MA-02 的 #60、SBX-8、SBX-9、SBX-6/7、月度批 0」之外，多回填了 M5 #93：它是新规则下第一次 L3，契约第 7 节原来漏了；
  - M5 #93 第 3 轮返修后怎么收口的未核实（PR 正文没写「补改未复审」）；它的接力记录 `risk` 字段为空（原会话驿窗 MCP 是旧版）；
  - `engineering-review` 闸 1：新规则下已有 2 次真实运行，但一次 L1、一次 L3，走法不完全一样，算不算「两次走法一致」留到批 B 判断；
  - 全局 CLAUDE.md / Codex AGENTS.md 的路由一行归 agent-kit，另开单。
- 本轮新坑：无。

## MA-02 契约 v0.2：与驿窗实现同步（2026-11-08，Claude，常浩对 postpane#217 方案回复「按方案开工」，方案写明驿窗落地后改契约这一句；已提交、待合并，无需发布）

- 时间：开工 `2026-11-08 01:38`（`date '+%F %H:%M'` 记录）。来由：postpane#233 已合并（`fb62a6a`），审查出口改在倒数第二行，与 v0.1 第 4 节「正文第一行」不一致。
- 改了哪些文件：`modes/MA-02-engineering-review.md`（状态、主 Skill 入口、第 4 节写法、第 5 节驿窗一行标为已对齐、第 10 节版本记录）；`CURRENT.md`。
- 测试：`node --test tests/*.test.mjs` 原样结果 `ℹ pass 4` / `ℹ fail 0`；`node scripts/check-rules.mjs` 输出 `通用规则检查通过`。
- 验证：第 4 节写法对照 postpane `src/crates/platform/src/clients/chatgpt/handoffs.rs` 的 `review_exit` 与实机接力 `h1a1b708fc4400`、`h1a1b70aa6ed02`。
- 截图：无。
- 发布与回读：无需发布。
- 与授权不一致之处、遗留问题、范围外发现：agent-kit 与 DT-ORC 的对齐没做，各自另开单。
- 本轮新坑：无

## I-MA-1：MA-01、MA-02 精简契约 + V1.0 评审入库（2026-11-07，Claude，常浩回复「都按推荐」授权开放写入并执行本单；已合并 `317945b`，无需发布）

- 时间：开工 `2026-11-07 22:50`（`date '+%F %H:%M'` 记录）。来由：V1.3 批 4 / 第 3.3 节执行单 I-MA-1；常浩先要求评审《多 Agent 协同 V1.0》，经思维评审（驿窗 `h1a1b66b1d7800`，成熟退出）后拍板三项。
- 改了哪些文件：
  - `modes/MA-01-thinking-review.md`：引用 thinking-review 1.0.0，补模式身份、分界、状态语义、两次真实运行与价值口径；
  - `modes/MA-02-engineering-review.md`：L0–L3 预算、不因换单或换 SHA 重置、四档语义与驿窗二态的对应、三处现行规则的落地边界，以及 #60、SBX-8、SBX-9、SBX-6/7 的运行记录；
  - `docs/design/` 四份：V1.0 原文（首页加定位声明）、修订表、决策记录、Claude 评审；
  - `AGENTS.md`：导航表与结构各加一处。
- 测试：`node --test tests/*.test.mjs` 原样结果 `ℹ pass 4` / `ℹ fail 0`；`node scripts/check-rules.mjs` 输出 `通用规则检查通过`。
- 验证：契约里的接力 id、轮次核对过驿窗 `handoffs.json` 的 steps 记录；提交号 `2839e91`（my-skills）、`374a81a`（digiworld）都用 `git log` 回读过；L0–L3 与「Codex 不是固定第三站」核对过 digital-twin `docs/DT-ORC/ARCHITECTURE.md`；agent-kit《工程流程》第 8 节第 1、3 条已核对。
- 截图：无。
- 发布与回读：无需发布。
- 与授权不一致之处、遗留问题、范围外发现：
  - 没改 `digital-twin/projects.json` 的 `write_allowed`：它是 Hermes 派单开关，归 digital-twin，要不要开由常浩另定；
  - 没改 agent-kit、驿窗、DT-ORC 的轮数规则，按 MA-02 第 10 节另开单；
  - 未核实：Codex 当前额度与执行环境、Hermes 大脑与 Codex CLI 是否共用额度（MA-03 何时试跑取决于这两项）；
  - V1.0 的 PDF 版没入库（第 1 页是常浩原始提问，第 2 页起是 ChatGPT 回答的截图排版，内容与 md 版一致）。
- 本轮新坑：无。

## 项目起步：建仓与协作骨架（2026-11-07，Claude，常浩转来 V1.3 定稿并要求按批次推进，首批含本项目骨架；已提交并推送、无需发布）

- 时间：开工 `2026-11-07 21:56`（`date '+%F %H:%M'` 记录）。来由：《项目体系重构 V1.3》新增能力项目，执行单 I-MA-0。
- 改了哪些文件：用「项目起步」铺骨架：`AGENTS.md`（含边界一节）、`CURRENT.md`、`docs/LESSONS.md`、`docs/OPERATIONS.md`、`docs/templates/handoff.md`、`docs/agents/` 三份、`tests/handoff-format.test.mjs`、`scripts/check-rules.mjs` 与 `tests/check-rules.test.mjs`、`.github/pull_request_template.md`。
- 测试：`node --test tests/*.test.mjs` 原样结果 `ℹ pass 4` / `ℹ fail 0`；`node scripts/check-rules.mjs` 输出 `通用规则检查通过`。
- 验证：推送后回读仓库为私有、只允许 squash、合并后删分支、5 个分流标签在。
- 截图：无。
- 发布与回读：无需发布。
- 与授权不一致之处、遗留问题、范围外发现：执行单见 `digital-twin/docs/项目体系重构/2026-11-07-V1.3技术确认与分仓执行单.md`。
- 本轮新坑：无。
