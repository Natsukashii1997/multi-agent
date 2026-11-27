# Agent 角色与能力档案

用途：决定一个协同模式里，谁来承担哪个角色。依据是 [V1.0 修订表](design/2026-11-07-V1.0修订表.md) 第 2 节，本文把它整理成可以直接查的形式，同时补上 2026-11-08 核实的事实。档案分两类：**长期档案**写擅长什么、能读到什么，很少变化；**动态条件**写额度、在不在线，每次用之前跑脚本查，不手写。

## 1. 六种协作角色

角色是职能，不是固定的 Agent；场景里不需要的角色可以省掉。

| 角色 | 负责 | 默认承担方 | 不能做的 |
|---|---|---|---|
| Owner | 目标、取舍、授权、最终裁决 | 常浩 | — |
| Thinker | 提出问题、分析、形成方案 | Claude / ChatGPT / 常浩，谁先想的都算；大方案可加 Gemini 4 Neon 独立出一份 | 把同一份方案原封不动交回原作者做「独立确认」 |
| Builder | 实施方案、修改交付物 | Claude Code | 只凭自测就宣称已被独立验证 |
| Challenger | 独立质疑、找盲区、审查 | ChatGPT High（经驿窗） | 声称跑过它没跑的测试；替代合并或上线授权 |
| Verifier | 做可复验的验证，给出证据 | Claude 自测；需要独立时找独立验证方（见第 3 节） | 和作者共用上下文、却算作独立验证 |
| Coordinator | 编排任务、接力、维护状态 | Claude；长期委派由 Hermes 承担 | 用一句「通过」代替技术评测（Hermes 同样） |

## 2. 长期档案

| Agent | 擅长 | 能读到的上下文 | 能否真实执行 | 响应成本 | 要不要常浩在场 |
|---|---|---|---|---|---|
| 常浩 | 定目标、拍板取舍、对外授权 | 全部 | 能 | 最贵，尽量少占用 | — |
| Claude Code | 带项目上下文分析、设计、写代码、修复、交接 | 本机仓库、文件、命令、浏览器 | 能（本机） | 分钟级 | 授权范围内不用 |
| ChatGPT High（聊天模式，经驿窗） | 独立认知质疑；方案批判；工程改动逻辑审查 | 默认只看到送审包和 PR；能不能读仓库、跑命令，取决于当次连接的工具，不写死 | 默认不能 | 一轮几分钟到十几分钟，占常浩的 ChatGPT 额度 | 驿窗自动往返时不用；人工交接时要 |
| Codex（CLI） | 异构的工程实现、可执行测试、复现、回归、核算 | 本机仓库（在它自己的会话里） | 能（本机，可开独立 worktree） | 分钟级，占 ChatGPT 账号的 Codex 额度（档位以探测为准，2026-11-27 为 free 档、月度已用 55%，和 Hermes 同账号） | 不用 |
| Gemini 4 Neon（Antigravity 桌面版，经驿窗） | 独立出方案、创意和头脑风暴；界面文案与交互顾问 | 只有交任务时给的原话和背景（新开会话不绑文件夹） | 默认不让它执行；只读顾问 | 一次几分钟，占 Antigravity 的 Google 账号额度 | 不用；桌面版要开着 |
| Hermes（常浩的数字分身） | 长期目标与项目状态、派单、授权记录、跟踪收口、飞书汇报 | 数字分身的记忆、项目名册、飞书 | 经 Multica 派执行 Agent | 异步，按小时或天 | 授权动作要 |

- Hermes 只有一个，就是常浩的数字分身。它不因为底层用了某个模型，就自动拥有那个模型 CLI 的能力。
- Codex 在数码世界 9–10 月做过独立复核。10-31 起审查改走 ChatGPT，DT-ORC ARCHITECTURE 写明「Codex 不是固定第三站」。它是可选的验证方，不是默认验证方。
- 派 Codex 写代码用 `node scripts/codex-worker.mjs <独立工作树> "任务"`（续接：`--resume <会话ID>`，只能在同一个工作树；`--timeout <分钟>` 默认 60），不直接调 `codex exec`：本机 `~/.codex/config.toml` 默认完全访问，还挂着 7 个 MCP 服务、插件和钩子。脚本不读用户配置，用 Codex 权限档案 `codex-worker`：根目录不可读，只放开系统运行目录和工具链（node 前缀、Homebrew、Xcode 命令行工具、系统 OpenSSL 配置），工作树可写，`$TMPDIR` 和 `/tmp` 也可写（继承 `:workspace`，测试和构建要用），断网；关掉 apps 连接器、goals、子代理；`--ignore-user-config` 只跳过用户那份配置，所以系统级（`/etc/codex` 下有文件、macOS 托管偏好）、项目级（工作树及上层目录的 `.codex/config.toml`，`CODEX_HOME` 下那份用户配置除外）配置只要存在就拒绝派活，工作树根的 `config.toml` 含 Codex 键（sandbox_mode、permissions、mcp_servers 等）也拒绝：它们会叠加上来放开权限或加载 MCP，命令行盖不住；给 Codex 的环境变量只留白名单（PATH、HOME、语言、代理、证书等），派活会话里的令牌和 `SSH_AUTH_SOCK` 进不去；git 不读用户 `~/.gitconfig`。只接受独立工作树（拒绝仓库主目录、main/master、分离头指针），新开要求工作树干净。独立工作树的 git 数据在主仓库 `.git` 里、不可写，Codex 提交不了；脚本另外比对派活前后的 HEAD、分支和 reflog。退出码区分启动失败、超时、被信号终止、Codex 非零退出、没有最后回复、偷偷提交（见脚本开头）；超时或包装脚本被中断时结束整个 Codex 进程组。只派接口已经定死、和页面无关的独立模块；接口、验收标准、要一起改的同类写进任务；交回后派活方读 diff、自己跑测试。2026-11-27 实测（Codex 0.166.0，macOS）：账号能用 `gpt-6-luna`；用 `codex sandbox` 在同一权限档案下直接跑，`~/.zshrc`、`~/.ssh`、`~/Documents` 读不到，工作树外写入、联网、`git commit` 都被拒；正常任务里 `node --test`、`git status` 可用（证据 `~/Library/Application Support/multi-agent/evidence/2026-11-27-ma04-gemini/pr19-round4-codex-worker/`）。
- Aily、OpenClaw 不算现役 Agent（V1.0 第 2.2 节）。
- Gemini 4 Neon 粗心、幻觉多（来源：数字生命卡兹克 2026-11 笔记），不让它判断代码事实、不做最终验收、不改仓库、不做对外动作；它的结论里标「推测」的，由 Claude 先核实再采纳。交任务的写法：驿窗 `start_session`（client `antigravity`，folder 留空，让它碰不到仓库），消息开头写清只读、简体中文、每条判断标【材料里有】或【推测】、第一行报模型档位，再附常浩原话和必要背景，**不给 Claude 自己的草稿和倾向**；桌面版 2.35.2 起需要驿窗 postpane#560 的兼容改动。取回复分四种情况，只有第一种算端到端接力成功：① `get_message` 拿到完整回复；② `get_message` 一直是 started：先看下一种；③ Antigravity 本机有回复、驿窗没取到（`~/.gemini/antigravity/brain/<会话ID>/.system_generated/logs/transcript_full.jsonl` 里有 `status: DONE` 的模型回复）：可以从这里取来用，但要在运行记录里写明「驿窗未取回」，并报给驿窗；④ 本机也没有回复：按没做完处理。2026-11-27 首次实跑当时是第 ③ 种（长回复）；postpane#560 装机版修好后，同一条消息 `get_message m-fa3b7d6821af` 当晚复查为 done、回复完整，属第 ① 种（postpane#560 合并前，本机装的是它的分支包）。`agy` 命令行（Homebrew `antigravity-cli`）已装，只作驿窗不可用时的备用。

## 3. 选择约束

1. **相对作者的独立性**：做 Verifier、Challenger 的一方，不能和作者共用上下文。最低要求是自己读证据、自己执行验证。换一个模型只是辅助条件，不能单凭这一点算独立。满足要求的验证方可以是：Codex 会话、隔离容器复跑（SBX-6/7 的做法）、一个不带作者上下文的新 Claude 会话。
2. **权限不随角色名增长**：审查员不是合并者，执行者不是审批者。
3. **没核实的动态条件不能当必备能力**：模式要求某个 Agent 时，先跑第 4 节的脚本；结果是「未核实」或「不可用」时，按模式契约暂停或换验证方，不能假设它可用。

## 4. 动态条件：每次用前跑脚本

```sh
node scripts/probe-agents.mjs          # 给人看
node scripts/probe-agents.mjs --json   # 给脚本用
```

只读、不调用任何模型、不消耗额度。查七项：Claude 额度、Codex 额度（来自驿窗定时读的快照）、Codex CLI 登录、驿窗进程、Antigravity 桌面版进程、Hermes 网关、Hermes 与 Codex 是不是同一个 ChatGPT 账号。快照超过 24 小时、用量不是合法数字、通用窗口都已过重置时间的，算「未核实」；模型专属额度用尽时标「部分用尽」。外部诊断文字脱敏后才显示。

2026-11-08 16:05 的结果（只作示例，用的时候以当次运行为准）：

- Codex：Plus 档，5 小时窗口已用 15%，一周已用 33%，CLI 已登录。
- **Hermes 与 Codex 是同一个 ChatGPT 账号**：Hermes 大脑（`~/.hermes/config.yaml`，provider `openai-codex`）和 Codex CLI 用的是同一个账号。Codex 额度按账号计，所以推断两边共用一份额度（这是推断，没有用消耗数据证实）。用 Codex 做独立验证可能和 Hermes 抢额度，安排 MA-03 试跑要避开 Hermes 夜跑。
- Claude：Max 20x 档，额度可用；驿窗、Hermes 网关都在运行。

驿窗只能查进程在不在；ChatGPT 网页通道连没连上，以发起接力时驿窗的返回为准。
