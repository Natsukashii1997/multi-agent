# 当前状态

当前阶段目标：MA-02 工程审查 skill（engineering-review 1.0.0，my-skills#77）落地，并有真实运行记录。（2026-11-08 常浩确认，digital-twin#114）

更新：2026-11-08。MA-01、MA-02 契约在 `modes/`，MA-02 已在四处对齐，新规则下有 L1、L3 各 1 次真实运行（另有本仓库 #5、agent-kit#46、#47 三次 L1）。批 A 配套设施已合并（#5，`514db58`）：场景路由 `docs/routing.md`、能力档案 `docs/agent-profile.md` + 探测脚本 `scripts/probe-agents.mjs`、候选卡 `docs/candidates.md`、运行记录 `runs/runs.jsonl`。全局路由一行（agent-kit#46 `2911c84`）已在修完漂移（agent-kit#47 `e33e1cf`）后装到本机，doctor ✓7 ⚠0 ✗0，新开的 Claude / Codex 会话会读到。唯一下一步：常浩 11-08 改为「一个一个做，先把 MA-02 的 skill 跑出来」，MA-03 试跑（候选：trainee-hub PR #27）暂缓。engineering-review 1.0.0 在 my-skills#77、分支 `claude/77-engineering-review`（worktree `~/Documents/ChatGPT/个人/work/.worktrees/my-skills-77`）：治理审计 0 错误 0 警告，盲测第 1 轮 5/5 后按 5 处缺陷修订，第 2 轮打分中；剩：第 2 轮全过 → 开 PR → 按新 skill 走 L1 送审收口 → 常浩批准合并 → links.tsv 已登记、主目录跑 link.sh → 本仓库 MA-02 契约与 routing.md 改为「主 Skill：engineering-review 1.0.0」。

## MA-02 第 4 节「送达未确认」对齐驿窗 postpane#466：没送成的不算（#14）（2026-11-20，Claude，常浩对驿窗改动确认「送达未确认两处」回「都改」，确认里写明四处规则文字同步改；已提交、PR 待常浩定合并，无需发布）

- 时间：开工 `2026-11-20 14:05`（`date '+%F %H:%M'` 记录）。★ 来由：驿窗 postpane#466（PR Natsukashii1997/postpane#468）把「没送成」从「送达未确认」里分出来：插件明确回报没点过发送，或发出时插件没连上、话没出驿窗的，按没送成处理、可以直接重送。本契约第 4 节还是旧口径。
- 改了哪些文件：`modes/MA-02-engineering-review.md`（第 4 节「送达未确认」一条末尾补一段：上面两种不算送达未确认，接力和发送前一样、自动往返不停、同一段话可以直接重送；点过发送没见开始、插件没说点没点过、补格式没送成的仍按送达未确认。修订记录加一行）。别的规则没动；第 5 节「不计轮：没送到、也没有回信」本来就和新口径一致。
- 测试：`node --test tests/*.test.mjs` 原样结果 `ℹ pass 23` / `ℹ fail 0`；`node scripts/check-rules.mjs`「通用规则检查通过」。★
- 验证：只有文字改动，对照驿窗 `docs/chatgpt-channel.md`「审核门」里 #466 那段逐句核过；没有可运行的行为。
- 截图：无。
- 发布与回读：无需发布。
- 与授权不一致之处、遗留问题、范围外发现：本 PR 开出时驿窗 #468 还在第 2 轮复审，合并顺序建议先驿窗 #468、后本 PR；姊妹改动：digital-twin#253、my-skills#120（issue 号，各开一个 PR）。
- 本轮新坑：无

## 推送前钩子：从 worktree 推送不再把测试的 git 操作落到本仓库（2026-11-20，Claude，常浩回「停用并修」；已提交、PR 待合并，无需发布）

- 时间：开工 `2026-11-20 11:36`。★ 来由：今天装的推送前钩子（骨架 0.4.0）从 worktree 推送时，git 把本仓库的位置（`GIT_DIR`）带进钩子，钩子跑的 `tests/hooks.test.mjs` 在临时目录建仓库、提交、推送都继承了它。临时仓库实测：推送的分支多出测试的 3 个提交，主目录变成裸仓库、不能用，测试却全过。本仓库 11:36 检查时还没中招，钩子已临时停用。
- 改了哪些文件：`scripts/hooks/pre-push`（跑检查前 `unset $(git rev-parse --local-env-vars)`）、`tests/hooks.test.mjs`（自己的 git 调用不继承这些变量；新增一条从 worktree 真推的用例，旧钩子下失败）。和骨架 0.4.1（my-skills#116）一致。
- 测试：在本 worktree 里 `sh scripts/hooks/pre-push`（规则检查加本项目的测试命令）退出码 0：`通用规则检查通过`，`node --test tests/*.test.mjs` 原样 `ℹ pass 23` / `ℹ fail 0`；`node --test tests/hooks.test.mjs` 单跑 `ℹ pass 4` / `ℹ fail 0`，换回旧钩子时新用例失败（在骨架上验证，见 my-skills#116）。
- 验证环境：替身（临时 git 仓库、本机裸仓库、真实的 worktree 和推送）。本仓库的 `core.hooksPath` 现在是停用状态，本 PR 合并、主目录更新后再装回，装后从 worktree 真推一次再算验收。
- 外部前提与实测：依赖 git 在 worktree 里给钩子带 `GIT_DIR`、以及 `git rev-parse --local-env-vars` 列出要清的变量，都在临时仓库实测过。
- 与授权不一致之处、遗留问题、范围外发现：停用钩子用的是 `git config --unset core.hooksPath`，装回是 `git config core.hooksPath scripts/hooks`。
- 本轮新坑：无（跨项目的坑，已向常浩提全局坑提案，未写入）。

## 装提交、推送前的必经检查钩子（2026-11-20，Claude，常浩批复盘 P4、P6「批（按改过的）」；已提交、PR 待合并，无需发布）

- 时间：开工 `2026-11-20 11:02`。★ 来由：跨项目复盘 P6「检查脚本接进必经环节」：没有 CI 的仓库装 pre-push 钩子；P4 的 commit-msg 钩子一起装。钩子来自起步骨架 0.4.0（my-skills#112）。
- 改了哪些文件：`scripts/hooks/pre-push`（推送前跑 `node scripts/check-rules.mjs` 和 `node --test tests/*.test.mjs`）、`scripts/hooks/commit-msg` + `commit-msg.mjs`（修复类提交正文要有「同类：」一行）、`tests/hooks.test.mjs`（单测 + 临时仓库真跑）、`AGENTS.md`（加安装命令 `git config core.hooksPath scripts/hooks`）；本文件。
- 测试：`node --test tests/hooks.test.mjs` 原样 `ℹ pass 3` / `ℹ fail 0`；在本 worktree 里 `sh scripts/hooks/pre-push` 退出码 0（证据 `~/session-retro/2026-10-18_2026-11-18/evidence/p6-hooks/multi-agent.txt`）。
- 验证环境：替身（临时 git 仓库、本机裸仓库）；本仓库的 `core.hooksPath` 合并后才在本机装，装后真推一次再算验收。
- 外部前提与实测：依赖 git 的 `core.hooksPath` 和钩子退出码，已在临时仓库实测。
- 与授权不一致之处、遗留问题、范围外发现：无。
- 本轮新坑：无。

## LESSONS 升级行补层级词、加规则检查（2026-11-19，Claude，跨项目复盘收尾子 agent，常浩批了「老项目接入 LESSONS 升级行检查：一次补齐」；已提交到 `claude/lessons-level`、PR 待合并、无需发布）

- 时间：开工 `2026-11-19 10:18`（`date '+%F %H:%M'` 记录）。来由：跨项目复盘 D 批，各项目 LESSONS 的「升级」行统一带层级词，并由规则检查守住。
- 改了哪些文件：`scripts/check-rules.mjs`（加 `lessons` 规则：每条 `## L-xx` 要有以〔结构〕〔机检〕〔体检〕〔文字〕〔提醒〕开头的「- 升级：」一行，写法照起步骨架）；`tests/check-rules.test.mjs`（加 1 条测试：缺升级行、升级行不带层级词各报一次，格式样例和合规条目不误报）；`docs/LESSONS.md`（「怎么升级」补一条层级词要求，格式样例改成「〔提醒〕未升级。」，与起步骨架一致）；本仓库 LESSONS 还没有真实条目，规则在真实文件上为绿。另修起步骨架带来的漏报：判断占位标题前先去掉反引号里的内容（标题里的 `<all_urls>` 之类原来会让整条不查），写法同 chatgpt-clipper#10（`cd80285`），并加 1 条测试；骨架本身由主会话另行处理。本节交接。
- 测试：`node --test tests/*.test.mjs` 改前 `ℹ pass 17` / `ℹ fail 0`，改后 `ℹ pass 19` / `ℹ fail 0`；`node scripts/check-rules.mjs` 改前改后都输出 `通用规则检查通过`。
- 验证：在 worktree `~/Sandbox/worktrees/multi-agent-lessons-level` 里跑；改前改后日志在 `~/Library/Application Support/multi-agent/evidence/2026-11-19-lessons-level/`。
- 截图：无。
- 发布与回读：无需发布。
- 与授权不一致之处、遗留问题、范围外发现：规则检查没有接进 CI 或提交前钩子，只在手动跑测试时生效（照实记录，没为此改结构）。
- 本轮新坑：无。

## 批 A：多 Agent 协同配套设施（2026-11-08，Claude，常浩回复「按推荐，开工批 A」「按计划开工」；常浩回复「合并」，已合并 `514db58`，无需发布）

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
- 测试：`node --test tests/*.test.mjs` 原样结果 `ℹ pass 17` / `ℹ fail 0`（补改后；补改前 11 / 0）；`node scripts/check-rules.mjs` 输出 `通用规则检查通过`。
- 审查：驿窗 `h1a1ba374ab600`，L1 第 1 轮，P0 0 / P1 3 / P2 3 / P3 1，出口「返修」。补改：候选卡字段改成 runs 已有字段并加模拟记录测试；探测对非法用量、已过重置时间的窗口标未核实，模型专属额度用尽标「部分用尽」，外部诊断文字脱敏，结构异常不抛错，Hermes 多账号标未核实，「共用额度」改为「同账号、推断共用」；runs 增加 `case_id`、`resolution`、`baseline`，`p0p1` 拆成 `reported_p0p1` 与 `verified_findings`，SBX-6/7 改为 `未协同`；routing 改为路由一行在 agent-kit#46 里做。L1 预算用完，PR 上写「补改未复审」。本次审查自身记为 `R-20261108-03`；agent-kit#46 的审查（1 条 P2，已补改未复审，提交 `1961543`）记为 `R-20261108-04`。
- 验证：`node scripts/probe-agents.mjs` 本机实跑六项（2026-11-08 16:05，补改后 16:19 复跑），结果写在 agent-profile 第 4 节；测试先抓到一个真缺陷（「Not logged in」被当成已登录），已修。runs.jsonl 每条对过驿窗 `handoffs.json`（轮次、verdict、时间）与 PR（digital-twin#93、niuma-home#23 的状态和正文）。
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
