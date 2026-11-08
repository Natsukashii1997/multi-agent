# 当前状态

更新：2026-11-08。MA-01、MA-02 两份契约在 `modes/`（MA-02 已到 v0.2，与驿窗实现同步）；驿窗已按 MA-02 落地工程接力审查预算（postpane#233，`fb62a6a`）。MA-02 已在四处一致：契约 v0.2、驿窗（postpane#233 `fb62a6a`）、agent-kit《工程流程》第 8 节第 3 条（agent-kit#41 `59a22a2`）、DT-ORC ARCHITECTURE 3.3 与 6.4（digital-twin#95 `5957acf`）。唯一下一步：核实 Codex 当前额度与执行环境，决定 MA-03 独立验证何时做第一次真实试跑（修订表第 4 节；没核实前 MA-03 保持候选）。

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
