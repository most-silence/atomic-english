# Atomic English 框架选型调研（framework-selection）

- 调研日期：2026-11-19（§1–§8 的版本号与能力状态在该日核实）；2026-11-20 补充 §9 部署方案、§10 迭代规划（部署平台定价、大陆可访问性与 PWA/壳层门槛在该日核实）
- 调研范围：应用主体框架（web-first）、移动端路径、桌面端路径、Monorepo 工程化、官网、后端/数据、本地数据/离线、最终推荐栈；补充范围为部署方案、迭代规划
- 结论的用途：作为 `apps/*`、`packages/*` 仓库布局与后续 ADR 的依据；§9、§10 作为上线与分阶段推进的依据
- 关键假设：产品面向中文用户，故 §9 把**中国大陆可访问性**作为部署选型的硬约束；若目标用户以海外为主，EdgeOne/备案相关结论需重估

---

## TL;DR 推荐栈

| 层 | 选型 | 一句话理由 |
| --- | --- | --- |
| 应用主体 | **React 19 + Vite SPA/PWA**（TypeScript） | 「先 web、后移动、再桌面」路径上生态复用最大化；学习产品登录后使用，SSR 非必需，SPA 起步最简单、重构成本最低 |
| 移动端 | **Capacitor 8**（网页壳优先）；远期原生需求用 Expo/RN 重写 UI 层 | 同一套 `@capacitor/core` API 同构跑在 Web 与 iOS/Android，web 代码 100% 复用 |
| 桌面端 | **Tauri 2（≥2.12）** | bundle 与内存远小于 Electron，updater 官方插件覆盖三大桌面系统，加载同一份 web 构建产物 |
| Monorepo | **pnpm workspaces + Turborepo** | 按交付物分 `apps/*`，按复用单元分 `packages/*`；任务图与远程缓存 |
| 官网 | **Astro 7**（`apps/website`，独立部署） | 默认零 JS 静态输出，SEO 最强，可嵌 React 岛屿复用共享 UI 包 |
| 后端 | **Supabase**（起步免费层，上线前升 Pro 或自托管） | Postgres + Auth + Storage + Realtime 全家桶，SQL 语义最适合学习进度这类关系数据，且可整体自托管逃生 |
| 本地数据 | **IndexedDB（RxDB/Dexie）起步**，同步层自研薄封装 | 零运维起步；存储后端隔离在 `@atomic/db`，将来可换 SQLite WASM/OPFS 或 PowerSync/Electric |
| 部署（§9） | **EdgeOne Pages（国内，备案域名）+ Cloudflare Pages（海外镜像）**；CI 走 GitHub Actions | 唯一有大陆节点的托管；默认域名 `.vercel.app` 在大陆必墙，海外平台无节点无法保证可用 |
| 迭代节奏（§10） | **四阶段：Web MVP → PWA 加固 → Capacitor 壳 → 桌面壳**，带量化准入门槛 | 先把接口做成多客户端就绪，用数据而非感觉决定加端，避免 PMF 未验证就上原生 |

**核心原则：领域逻辑（课程、卡片、SRS 判分、进度）全部收进 `packages/*`，与 React、与任何壳、与任何后端解耦。** 壳与基础设施都被视为"可替换外设"。

> 说明：部署与迭代两章为 2026-11-20 补充，原报告调研范围（见 TL;DR 上方）不含此二者；两章的论证标准与§1–§8 一致（候选对比 + 一手来源 + 明确结论）。

---

## 1. 应用主体框架（web-first）

### 1.1 候选现状（2026-11-19 核实）

| 框架 | 当前版本（核实日期） | 来源 |
| --- | --- | --- |
| React | **19.3.1**（2026-10-14 发布；19.3.0 引入 `<ViewTransition/>`、Fragment Refs、React Server Components 改进） | npm `react@19.3.1`；GitHub Releases https://github.com/facebook/react/releases/tag/v19.3.1 （仓库现托管于 react/react，facebook/react 301 重定向） |
| Next.js | **16.4.6**（2026-11-09） | https://github.com/vercel/next.js/releases/tag/v16.4.6 |
| Vite | **8.3.8**（Rolldown 内核） | https://registry.npmjs.org/vite/latest |
| Vue | **3.5.45**（2026-11-05） | https://github.com/vuejs/core/releases/tag/v3.5.45 |
| Nuxt | **4.6.4**（2026-11-02，安全更新） | https://github.com/nuxt/nuxt/releases/tag/v4.6.4 |
| Svelte | **5.58.0**（2026-11-18） | https://github.com/sveltejs/svelte/releases/tag/svelte%405.58.0 |
| SvelteKit | **3.x**（kit 3.4.0，adapter-node 6.0.5，2026-11-18） | https://github.com/sveltejs/kit/releases |
| Solid | **2.0 稳定（2026-11-16 刚发布**：async 进响应图、server functions、OXC/Rust 编译器；**SolidStart 作为独立元框架被废弃**，并入 start mode，1.x 移至 v1.solidjs.com） | https://www.solidjs.com/blog/solid-2-0-the-long-hold ；https://docs.solidjs.com/ （"For Solid 1.x and SolidStart, see the Solid 1.x documentation"）；https://docs.solidjs.com/migration/from-solid-start |
| Angular | **22.3.0**（2026-11-18） | https://github.com/angular/angular/releases/tag/v22.3.0 |

### 1.2 按「web → 移动 → 桌面」路径对比

| 维度 | React (Vite SPA/PWA) | Vue/Nuxt | SvelteKit | Solid 2.0 | Angular 22 |
| --- | --- | --- | --- | --- | --- |
| web 交付（PWA/SPA） | ✅ Vite 8 成熟 | ✅ Nuxt 也可 SPA 模式 | ✅ | ✅ | ✅ |
| 移动端复用路径 | ✅ **Capacitor 同构 API** + ✅ **Expo/RN 58（React 19.3）真原生兜底** | ⚠️ Capacitor 可用；真原生需 uni-app（非 RN 级生态） | ⚠️ 仅 Capacitor 壳 | ⚠️ 仅 Capacitor 壳 | ⚠️ 仅 Capacitor 壳 |
| 桌面端 | ✅ 两个壳（Capacitor 生态无桌面，Tauri/Electron 均加载 web 产物） | 同左 | 同左 | 同左 | 同左 |
| 组件/样式生态 | ✅ 最大（shadcn/ui 129k★、TanStack、React Flow 等） | ✅ 大 | ⚠️ 中 | ⚠️ 小 | ✅ 大但自成体系 |
| AI 辅助/招聘市场 | ✅ 最大语料 | ✅ 大 | ⚠️ 中 | ⚠️ 小（2.0 发布仅 3 天） | ✅ 大 |
| 框架 churn 风险 | ⚠️ RSC/Next 迭代快（**SPA 起步可完全避开 RSC**） | ✅ 低 | ✅ 低 | ⚠️ 刚经历破坏性 2.0 迁移 | ⚠️ 大版本年更，但升级工具好 |

### 1.3 结论

**明确倾向：React 19 + Vite + TypeScript 的 SPA/PWA。**

理由（按权重）：

1. **移动端是复用率分水岭。** 四条路径里只有 React 同时拥有两个高质量出口：Capacitor（同构 API，web 代码 100% 复用，见 §2）和 Expo/RN（SDK 58 直接绑 React 19.3，见 §2）。Vue/Svelte/Solid 用户到移动端只剩 Capacitor 一条路，且失去「将来换真原生」的退路。
2. **SPA 起步对「重构成本最低」最有利。** 学习产品主界面在登录墙后，营销 SEO 由独立官网承担（§5），主站 SSR/SSG 不带来收益，却把业务代码耦合进元框架的渲染约定。Vite SPA 把「换框架」的成本压到只重写视图层。
3. **远期若确需 SSR**（如课程分享页要 SEO），迁移路径是渐进的：可给 SPA 加 prerender，或整站迁 Next.js 16（Next 官方支持 Vite 迁移路径），领域层 `packages/*` 不动。
4. Solid 2.0 技术上优秀（无 VDOM、signals），但 2026-11-16 才发稳定版、SolidStart 刚被废弃重组，生态与资料密度对 4 端长期项目风险偏高；SvelteKit 是可靠次选，仅输在移动端退路与 AI/招聘语料。

**不建议**：Nuxt（Vue 的移动退路问题同上）；Angular（全家桶收益对这个体量为负）；SolidStart（已废弃，见上）。

> 注意：Tauri 官方前端配置文档同时覆盖 Next.js / Nuxt / SvelteKit / Vite（https://v2.tauri.app/plugin/updater/ 站点导航 /start/frontend/），说明桌面壳对主框架选择不敏感——主框架决策由移动端路径主导。

---

## 2. 移动端路径

### 2.1 四条路径对比（2026-11-19 状态）

| 维度 | **Capacitor 8.6.2** | **Tauri 2 移动端**（2.12） | **Expo 58 / RN 0.88** | **Flutter** |
| --- | --- | --- | --- | --- |
| 版本核实 | 8.6.2（2026-11-12），v9 docs/next 已挂出 | CLI 2.12.6（2026-11-18）；2.12 博客（2026-09-26）自述"biggest update so far in 2.x"，修 Android 路径/模板，targetSdk 37 | expo@58.0.26（2026-11-17 前后），React 19.3.0 / RN 0.88.1 | （本次未深查，见结论） |
| 与 web 端代码复用 | **UI+逻辑 100% 复用**（同一构建产物装进 WebView；官方文档：许多插件"available in both contexts with the exact same API"，且官方一等支持 PWA） | UI 100% 复用；插件体系与 Capacitor 不同（Rust core + Swift/Kotlin 插件） | **仅复用非 UI 逻辑**（TS 领域包）；UI 需 RN 组件重写 | 仅可复用"业务规则文档"，代码 0 复用 |
| 成熟度风险 | ✅ 低：8.x 大版本迭代稳定，Ionic/OutSystems 商业支撑 | ⚠️ 中：官方自述各插件稳定性不一（"Not all plugins are as stable as Tauri itself"）；Android WebView 碎片化（厂商 WebView 版本差异）直接影响音频/播放体验 | ✅ 低：Meta 主线 + Expo 全托管构建 | ✅ 低（Google 主线），但 web 复用为 0 |
| 音频/口语场景 | ⚠️ 需注意 iOS WebView 自动播放/后台音频策略（原生插件可解） | ⚠️ 同为 WebView，策略类似 + Android 碎片化 | ✅ 真原生音频管线（expo-audio 等） | ✅ 真原生 |
| 维护成本 | 低（壳层薄，几乎无原生代码） | 中（需 Rust 工具链；iOS/Android 模板随 2.x 小版本有破坏性调整，如 2.12 的 Gradle/Kotlin/proguard 迁移） | 中高（Expo SDK 年度大版本 + RN 升级节奏） | 高（独立技术栈独立团队心智） |

来源：
- Capacitor 概述与 PWA 同构：https://capacitorjs.com/docs 、https://capacitorjs.com/docs/web/progressive-web-apps
- Capacitor releases：https://github.com/ionic-team/capacitor/releases/tag/8.6.2
- Tauri 2.0 stable（iOS/Android）：https://v2.tauri.app/blog/tauri-20/ ；插件稳定性声明见同页 Plugins 节
- Tauri 2.12：https://v2.tauri.app/blog/tauri-2.12/
- Expo npm：https://registry.npmjs.org/expo/latest

### 2.2 结论

**首选 Capacitor 8 网页壳。** 它是唯一让 `apps/web` 的全部代码原样进 App 的方案，且官方 PWA 支持让 web 版本身就是"第 0 个移动端"。领域逻辑与 UI 都不需要为移动端重写。

**兜底与触发条件：** 若 App 阶段出现 WebView 解决不了的需求（后台长时间播放、系统级 TTS、深度离线音频缓存、原生推送体验），**用 Expo/RN 重写 UI 层**——因为领域逻辑在 `packages/@atomic/domain`（纯 TS），重写仅限视图与平台适配层，这是四条路径里唯一"低损失重写"的组合。Flutter 因零复用直接排除；Tauri 移动端保持观察，2.12 显示其活跃度高，但插件稳定性声明与 Android WebView 碎片化让我们不把核心业务押在上面。

---

## 3. 桌面端路径

### 3.1 Tauri 2 vs Electron（2026-11-19 状态）

| 维度 | **Tauri 2（2.12）** | **Electron（45.x）** |
| --- | --- | --- |
| 版本核实 | CLI 2.12.6（2026-11-18）；2.12 发布 2026-09-26；MSRV 1.90（policy: stable−3）；**放弃官方 Windows 7 支持** | 45.4.1（2026-11-19，Chromium/V8 回移补丁） |
| bundle 体积 | 小（用系统 WebView，官方长期卖点，App Size 文档专门章节 https://v2.tauri.app/concept/size/） | 大（捆绑 Chromium+Node，通常 80–150MB+） |
| 内存 | 低（单 WebView） | 高（Chromium 多进程） |
| 自动更新 | ✅ 官方 updater 插件，**平台支持表：Windows/Linux/macOS/Android/iOS 全部官方支持**，静态 JSON 或动态服务器两种后端（https://v2.tauri.app/plugin/updater/） | ✅ Squirrel（macOS/Windows）+ update.electronjs.org（限公开 GitHub 仓库、macOS 需签名）；**Linux 无内建方案**，需 AppImage 手动机制（https://www.electronjs.org/docs/latest/tutorial/updates） |
| 三系统成熟度 | ✅ 桌面自 1.0（2022-06）生产可用；Linux 依赖系统 WebKitGTK（版本碎片是历史痛点，2.12 有 Linux 图形调试专页 https://v2.tauri.app/develop/debug/linux-graphics/） | ✅ 最成熟（十年生产验证，兼容性问题最少） |
| 安全审计 | 2.0 有外部安全审计 + 权限/能力模型（capabilities） | 成熟但模型较老（contextIsolation 等约定） |
| 工具链 | 需 Rust 工具链（但壳层可不写 Rust） | 纯 JS/TS |

### 3.2 结论

**选 Tauri 2（≥2.12）。** 学习类应用 UI 是普通表单/卡片/音频播放，不依赖 Chromium 独有特性；Tauri 在体积/内存/更新通道上全面占优，且 updater 插件连移动端都覆盖，未来若想统一壳体系留有退路。Electron 保留为**兼容性兜底**：若出现 Linux WebKitGTK 渲染 bug 或 WebGL/音频兼容问题，`apps/desktop` 的壳替换成本被 §8 的隔离原则控制在最小。

与移动端组合后的"壳矩阵"：web=PWA（0 壳）、移动=Capacitor、桌面=Tauri。两个壳都是"加载 `apps/web` 构建产物 + 少量平台桥"，不产生业务逻辑分叉。

---

## 4. Monorepo 工程化

### 4.1 工具：pnpm workspaces + Turborepo

- Turborepo 2.11.13（2026-11-18，https://github.com/vercel/turborepo/releases/tag/v2.11.13 ；域名已迁 turborepo.dev，文档 https://turborepo.dev/docs 自述"framework-agnostic、任何包管理器、增量采用"）。
- Nx 23.3.2 同样活跃（https://github.com/nrwl/nx/releases/tag/23.3.2），但自带更多约定/生成器；本项目规模用 Turborepo 的"薄封装"更贴合"重构成本低"目标。Nx 将来想换随时可换（两者都只消费 package.json scripts + 一个配置文件）。

### 4.2 仓库布局（与 `AGENTS.md` 既有约定一致）

```
atomic-english/
├─ apps/
│  ├─ web/          # 产品主应用：Vite + React SPA/PWA（第一优先交付物）
│  ├─ website/      # 官网营销站：Astro（独立部署、独立发布节奏）
│  ├─ mobile/       # （阶段 2 再建）Capacitor 壳：weblify apps/web 的产物
│  └─ desktop/      # （阶段 3 再建）Tauri 壳：同一产物 + Rust 桥
├─ packages/
│  ├─ domain/       # 领域逻辑：课程/卡片/SRS 判分/进度模型（纯 TS，零框架依赖）
│  ├─ ui/           # 共享 UI 组件（shadcn/ui 拷贝式 + Tailwind tokens）
│  ├─ api-client/   # 后端访问接口 + Supabase 实现（见 §6）
│  ├─ db/           # 本地存储/离线同步适配层（见 §7）
│  ├─ audio/        # TTS/播放引擎 adapter（Web Speech API → 云 TTS → 本地 TTS）
│  └─ config/       # eslint / tsconfig / tailwind 预设
├─ docs/research/   # 本报告所在
└─ turbo.json
```

要点：
- `apps/mobile`、`apps/desktop` **懒创建**：阶段 1 只存在 `apps/web` + `apps/website`，避免为不存在的交付物付维护成本。
- `packages/domain` 是重构保险：禁止 import React/任何平台 API，保证将来 RN 重写或换壳时领域层原封不动。
- issue 标签按 `area:web / area:website / area:mobile / area:desktop / area:backend / area:shared` 分轨（AGENTS.md 既有规则）。

---

## 5. 官网（Astro vs 主框架顺带）

| 维度 | **Astro 7.4**（独立 `apps/website`） | 用 Next.js 顺带做（主站兼官网） | 纯静态手写 |
| --- | --- | --- | --- |
| 默认 JS 输出 | 0 JS（岛屿按需 hydration），LCP/SEO 天然最优 | 需自制 RSC 约束，营销页容易带入 App 的 JS/水合负担 | 0 |
| 内容维护 | ✅ Content Collections + Markdown/MDX，非工程师可写 | App 代码库里混内容路由 | 手工 HTML |
| 与主站关系 | ✅ 完全分离：部署/节奏/故障域隔离（AGENTS.md 已定"单独部署"） | 耦合 | 分离但无组件复用 |
| 复用产品 UI | ✅ 可嵌 React 岛屿复用 `packages/ui` 的展示组件 | 天然同框架 | ❌ |

核实：Astro 7.4.13（npm latest，engines: node ≥22.23.4；其自身依赖 Vite 8.3.8 与 Rolldown）：https://registry.npmjs.org/astro/latest

**结论：Astro 独立 app（`apps/website`），同仓不同部署。** SEO 是营销站的核心 KPI，Astro 默认零 JS；需要交互的展示组件（价格表、演示卡片）用 React 岛屿从 `packages/ui` 引入，保持品牌与代码复用。官网随时可上线的节奏（AGENTS.md）与产品端完整测试流程互不拖累。

---

## 6. 后端 / 数据（简要）

| 维度 | **Supabase** | **Firebase** | 自托管 |
| --- | --- | --- | --- |
| 数据模型 | ✅ Postgres：学习进度=强关系数据（用户-课程-卡片-复习记录），SQL/约束/视图直接表达 | NoSQL（Firestore），冲突与聚合逻辑放客户端/云函数，学习记录建模别扭 | ✅ 任意 |
| Auth / Storage / 实时 | ✅ 全内建（Realtime 订阅、音频存 Storage） | ✅ 全内建 | 自拼（Keycloak+MinIO+…），起步成本高 |
| 逃生舱 | ✅ Postgres 开源可整体自托管（supabase CLI 本地跑） | ⚠️ 专有 API，迁移=重写 | ✅ |
| 免费层风险 | ⚠️ **免费项目 7 天低活动即暂停**（官方文档 https://supabase.com/docs/guides/platform/free-project-pausing ）；Pro $25/月起不暂停（https://supabase.com/pricing） | 免费额度长期可用但计费模型易失控 | 服务器成本固定 |

**结论：起步用 Supabase 免费层。** 理由：关系模型贴合学习进度；音频文件与 TTS 结果走 Storage；Realtime 满足多端进度同步；整体开源可自托管是最重要的长期逃生舱。**纪律：** 所有访问经 `packages/api-client` 的接口（`getCourseProgress()`、`recordReview()`…），Supabase 实现只在 `api-client` 一处出现；上线前二选一：升 Pro，或 Postgres 导出 + 自托管。

TTS：起步用浏览器 Web Speech API（`speechSynthesis`，免费零依赖），云端 TTS（Azure/Google/ElevenLabs）作为 `packages/audio` 的第二实现，按需接入。

---

## 7. 本地数据 / 离线（简要）

- **IndexedDB vs SQLite(WASM/OPFS)**：IndexedDB（经 Dexie/RxDB Dexie-storage）是浏览器零依赖起点；SQLite WASM 是官方子项目（https://sqlite.org/wasm/doc/trunk/index.md ），持久化靠 OPFS，性能与 SQL 表达力更强，但 worker/COOP-COSEP 头等集成成本更高；wa-sqlite 是 OPFS 先驱（官方文档"Related Works"点名，https://github.com/rhashimoto/wa-sqlite ）。
- **local-first 方案现状**（2026-11-19）：
  - RxDB 17.6.0（Apache-2.0，npm latest）：Dexie/SQLite/内存等可插拔 storage，replication 插件覆盖 Supabase/Firestore/CouchDB/WebSocket 等（包 exports 实证：https://registry.npmjs.org/rxdb/latest ）。核心免费，部分高级插件商业授权——注意选型时只用免费插件。
  - PowerSync：Postgres/MongoDB/MySQL/SQLServer 为源的同步引擎；云 Free 层 **1 周不活跃停用、2GB/月、50 并发**，Pro $49/月起（https://www.powersync.com/pricing ）；客户端 SDK 全平台。
  - Electric（现 Electric Sync，electric.ax）：**读路径** Postgres→客户端 Shape 同步 + TanStack DB/PGlite，写回走自己的 API（https://electric.ax/docs/sync/ ）；自托管可用。

**结论：起步 IndexedDB（RxDB Dexie storage 或裸 Dexie）+ 自研薄同步（Supabase Realtime + 冲突以"最后写入 + 服务端仲裁"起步）。** 理由：学习产品的离线需求（卡片缓存、离线复习、联网后同步）用简单 CRDT 意义不大，冲突面窄；PowerSync/Electric 都带"免费层停用/自托管运维"成本，等真实用户数据证明需要时再引入。**纪律：** 领域代码只见 `@atomic/db` 的 repository 接口，RxDB→SQLite WASM/OPFS 或 PowerSync 的替换不动业务代码。

> **实施更正（2026-11-21）**：落地时选了**裸 Dexie**（未引入 RxDB），同步机制也简化了——**没有** Supabase Realtime 订阅、**没有**服务端仲裁，改为「登录/本地变更/网络恢复时 pull → `domain.mergeSnapshots` 确定性合并 → push」的定时/事件驱动方式（见 `apps/web/src/sync/orchestrator.ts`、`packages/domain/src/sync.ts`）。合并规则是按字段的确定性策略：完成日期取并集、额度取保守值、作答去重、SRS 取更成熟者。原方案里的 Realtime + 服务端仲裁作为「多端并发冲突证明有必要后再引入」的升级路径保留；当前未实现属已知偏差，不是遗漏。

---

## 8. 最终推荐

### 8.1 技术栈组合（一句话版）

> **TypeScript 全栈 monorepo（pnpm + Turborepo）：`apps/web` = Vite + React 19 SPA/PWA；`apps/website` = Astro 7；`apps/mobile`（阶段 2）= Capacitor 8 壳；`apps/desktop`（阶段 3）= Tauri 2 壳；`packages/domain|ui|api-client|db|audio` 承载全部复用；后端 Supabase（Postgres/Auth/Storage/Realtime），本地 IndexedDB（RxDB/Dexie）+ 自研薄同步；TTS 从 Web Speech API 起步。**

### 8.2 为什么这套组合"软件工程最优"

1. **复用率**：一份 React 代码 → PWA + iOS + Android + 三桌面（Capacitor/Tauri 都是"装 web 产物的薄壳"）；领域逻辑连框架都不依赖。
2. **可维护性**：每个外部依赖（Supabase、RxDB、Capacitor、Tauri、TTS）都收敛在一个 package/adapter 的接口后面；升级或替换是局部手术。
3. **重构成本低**：最可能的两个重构方向——RN 重写移动 UI、SSR 化主站——都被"SPA 起步 + 领域层独立"预先留好了路，且不需要动 `packages/domain`。
4. **生态成熟度**：React 19.3 / Vite 8 / Astro 7 / Capacitor 8 / Tauri 2.12 / Turborepo 2.11 全部是 2026-11 仍在活跃发版的线（见各节来源）。
5. **长期风险小**：唯一的"重锁定"组件 Supabase 有 Postgres 自托管逃生舱；两个壳互为兜底（Tauri↔Electron、Capacitor↔Expo）。

### 8.3 主要风险

| # | 风险 | 影响 | 缓解 |
| --- | --- | --- | --- |
| 1 | **WebView 音频/自动播放策略差异**（iOS Safari 限制、Android 厂商 WebView 碎片化）——听力/口语是核心体验 | 高 | 阶段 1 就做"音频 spike"（自动播放、后台播放、缓存）；`packages/audio` 收敛所有播放逻辑；App 阶段预留原生插件出口 |
| 2 | **Supabase 免费层 7 天暂停 + 数据粘性**：开发期体验差；Auth/Edge Functions 有迁移成本 | 中 | 开发环境用 supabase CLI 本地栈；数据模型保持纯 Postgres（随时 pg_dump）；上线决策点：升 Pro $25 或自托管 |
| 3 | **升级节奏负担**：Expo SDK 年度大版本、RN 0.8x、Tauri 2.x 小版本破坏性调整（如 2.12 的 Android 模板迁移）、React 生态 churn | 中 | 壳层懒建、锁版本、Renovate 小步升级；RSC/Next 类 churn 因 SPA 起步而天然隔离 |

### 8.4 「以后最容易替换的部分」与隔离方式

| 可替换件 | 隔离位置 | 替换场景 |
| --- | --- | --- |
| 移动壳 Capacitor | `apps/mobile`（对领域零依赖） | 换 Expo/RN 重写 UI 层；领域与 api-client 原样复用 |
| 桌面壳 Tauri | `apps/desktop` | 换 Electron；只改壳与自动更新配置 |
| 本地存储引擎（Dexie/SQLite WASM/OPFS） | `packages/db` 的 repository 接口 | 换 PowerSync/Electric 或纯 SQLite；业务代码不动 |
| 后端 Supabase | `packages/api-client`（接口 + 实现） | 换自托管 Supabase / 其他 BaaS / 自建 API；只改实现文件 |
| TTS/音频引擎 | `packages/audio` adapter | Web Speech → 云 TTS → 端上模型；调用方无感 |
| UI 组件（shadcn/ui 拷贝式代码） | `packages/ui` | 换设计系统时只改此包 |
| 官网框架 Astro | `apps/website` | 换任何静态方案，不影响产品端 |

---

## 9. 部署方案（2026-11-20 补充）

> **⚠️ 本节已废弃，不代表当前部署方式。** 2026-11-21 起日常使用与部署统一走 Docker（一条命令拉起前端容器 + Supabase 后端），现行方案见 [`docs/deployment.md`](../deployment.md) 与仓库根 `docker-compose.yml` / `scripts/start-docker.sh`。本节保留作为当时的调研记录（平台对比、大陆可达性、备案成本等事实仍有参考价值），但其中的 EdgeOne Pages + Cloudflare 镜像 + GitHub Actions 编排结论**已不再执行**。若未来要上公网托管平台，可重新启用本节结论。

本节解决"构建产物放到哪里、怎么上线"。约束来自产品形态与用户地域：`apps/web` 是 **Vite 静态产物 + Supabase 后端**（§1、§6），`apps/website` 是 **Astro 静态站**（§5）——两者都是静态托管，不需要 SSR 运行时；真正的动态能力都在 Supabase。因此部署选型的重心不是"跑 Node 服务"，而是**大陆可达性、成本可预测性、预览协作**。

### 9.1 四平台现状对比（2026-11 核实）

| 维度 | Vercel | Cloudflare Pages | Netlify | EdgeOne Pages（腾讯云 Makers） |
| --- | --- | --- | --- | --- |
| 免费档 | Hobby $0，**禁止商用** | Free $0，**可商用** | Free $0，可商用 | 免费版 ¥0 长期免费，可商用 |
| 最低付费档 | Pro **$20/人/月**（含 $20 用量抵扣） | Pro $25/月（年付 $20）；函数算力另走 Workers Paid $5/月起 | Personal $9/月；Pro **$20/月且成员不限** | 专业版刊例 ¥140/月，限时 5 折，含 140,000 MU/月 |
| 免费带宽 | 100 GB/月 | **不限量**（各档均不限） | credit 池抵扣（约 20 credits/GB） | 安全加速流量不限量（不保 SLA） |
| 免费构建 | 口径不一（600–6,000 分钟/月），保守按 600 估 | 500 次/月、并发 1 | 300 credits 上限 | 500 次/月、并发 1、4 核 6GB |
| 免费函数 | 1M Edge Requests + 1M 调用 | Workers 10 万请求/天 | credit 池抵扣 | Edge Functions 300 万次 + 300 万 ms CPU |
| 预览部署 | 分支/PR 自动预览；**加锁要加购**（密码保护约 $20/月、Advanced Protection $150/月、自定义预览后缀 $100/月） | commit/PR 预览 + Cloudflare Access 做鉴权，免费可用 | **Deploy Previews 无限量且全档包含** | 预览域名有效期约 3 小时，对外须绑自定义域名 |
| **大陆默认域名** | `.vercel.app` **3/3 测试全阻断**（最近 2026-11-04），194/194 URL blocked | `pages.dev` 长期不稳定（DNS 污染/解析劫持） | `.netlify.app` 5/5 可达但首屏 >2s、时断时续 | **可直接访问、境内节点加速** |
| 大陆节点 | **无**（19 区 126 PoP，最近香港 hkg1） | **无**（流量绕道，晚高峰丢包） | **无** | **有**（官方称全球 3,200+ 节点） |
| 备案 | 不需要，但也拿不到大陆加速 | 不需要 | 不需要 | **用大陆节点必须 ICP 备案**；未备案仅走海外节点 |
| 框架匹配 | 静态站/SPA 可；Next 生态原生 | 静态/SPA 均可，Astro 友好 | 静态/SPA 均可 | 静态站友好（Hexo/Vue/React/Astro）；**无持久文件系统，不支持 SQLite/Docker** |

来源见参考来源 §部署。几个必须点明的口径陷阱：
- **"默认域名可达" ≠ "可作为大陆主机"。** Vercel/Netlify/Cloudflare 均无大陆节点，官方明言无法保证大陆可用性与性能；绑自定义域名会改善（封锁按域名施加，新域名通常未被测），但不改变"没有节点"这一物理事实。
- **Netlify 2025-09 起改 credit 池**：构建、带宽、请求、函数从同一池扣，旧口径"免费 100 GB 带宽"已失效。
- **EdgeOne 免费版额度处于商业化前宽松期**，官方声明后续可能调整；做预算按专业版 ¥140/月封顶估。
- 社区有 CNAME 优选方案（如每 40 分钟刷新优选 IP 的开源项目）可缓解海外平台在大陆的绕路，但属绕过式优化、稳定性无保障，不作为正式方案。

### 9.2 结论

**主托管选 EdgeOne Pages（绑已备案的自定义域名），Cloudflare Pages 做海外镜像与静态备份，两平台只托管构建产物；构建与部署编排走 GitHub Actions，让平台退化成"产物托管 + CDN"，避免被单一平台绑定。**

理由（按权重）：

1. **大陆可访问性是硬约束，不是优化项。** 四家里只有 EdgeOne 有境内节点；实测北京电信 4.2s→0.8s、上海联通 5.1s→0.9s、广州移动 4.8s→0.7s（对比 Cloudflare）。学习产品的核心动作是每日复习，首屏从 5s 降到 1s 直接决定留存；Vercel 默认域名在大陆全阻断，连"能打开"都不满足。
2. **备案要前置，不能拖到上线前。** EdgeOne 要吃大陆节点就必须 ICP 备案，备案需要周期。§10 的阶段一就应启动域名注册与备案，与开发并行，否则阶段一上线时只能走海外节点、速度优势归零。
3. **双平台对冲"全军覆没"风险。** 海外平台在大陆的可达性按域名/运营商/时段动态变化；主站 EdgeOne + Cloudflare 海外镜像，用 DNS 按访客地区分流，任一平台故障不至于全站不可达。
4. **静态托管正好匹配架构。** §1 的 Vite SPA 与 §5 的 Astro 都能构建成纯静态，EdgeOne 的"无持久文件系统、不支持 SQLite/Docker"限制对本项目无害——数据都在 Supabase（§6）。若未来产物需要 Node 运行时，再评估迁移，但当前没有任何理由引入。

**被否决的选项与触发条件：**
- **Vercel**：仅当产品决定全员出海、且深度用 Next.js/RSC（§1 已否决 SPA 起步的 RSC 耦合）时才优先考虑；$20/人/月 对 5 人团队即 $100/月，且预览加锁要额外加购。
- **Netlify**：预览协作体验最好（Deploy Previews 无限量、Pro 不限成员），可作为"团队优先、大陆非重点"时的次选；credit 池不透明是预算可控性的扣分项。
- **纯 Cloudflare Pages（不配 EdgeOne）**：仅当决定不做大陆市场时成立——各档带宽不限量、免费可商用，是成本最优的全球静态托管。

**CI/CD 约定：** 构建统一走 GitHub Actions（pnpm + Turborepo 的任务图，§4），产物推送到两个托管平台；环境分 `preview`（PR 自动)/`staging`/`production` 三档，环境变量按 deploy context 隔离；Supabase 开发期用本地 CLI 栈、生产用独立项目（§6 的逃生舱纪律不变）。

### 9.3 部署风险

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| ICP 备案周期不确定，阶段一上线时域名未备好 | 大陆用户只能走海外节点，首屏退化到 4–5s | 阶段一启动即提交备案，与开发并行；过渡期先绑 Cloudflare 镜像 + 自定义域名保证可达 |
| EdgeOne 免费额度商业化后收紧 | 成本上升 | 按专业版 ¥140/月做预算，功能设计不依赖免费额度；双平台可随时切换权重 |
| 双平台 DNS 分流配置错误 | 海外用户被解析到国内节点或反向 | 用 DNSPod/权威 DNS 按地区解析；上线前从大陆与海外分别实测，保留一键切回单平台的开关 |
| Supabase 在大陆的可达性（§6 风险的部署侧延伸） | 后端 API 慢/不通，前端再快也无用 | 数据访问全部经 `@atomic/api-client`（§6 纪律）；必要时把 Supabase 自托管到国内、`api-client` 换实现即可，前端不动 |

---

## 10. 迭代规划（2026-11-20 补充）

本节解决"分几阶段、每阶段做什么、什么条件才进下一阶段"。核心纪律来自 §1、§2 的技术路线：**接口先做成多客户端就绪**（领域逻辑与数据访问收敛在 `packages/*`，§8.4），这样"加一个端"等于"写一个新前端"，而不是重做产品；以及**用数据而非感觉决定加端**。

### 10.1 四阶段路线图与准入门槛

| 阶段 | 目标 | 交付物 | 进入下一阶段的量化门槛 |
| --- | --- | --- | --- |
| **阶段一：Web MVP**（验证需求） | 单一平台跑通核心学习闭环（学习→复习→判分→进度） | `apps/web` 上线（EdgeOne + 备案域名，§9）；`packages/domain` 骨架；`apps/website` 落地页；Supabase 本地栈 | 真实用户能**稳定无协助完成核心动作**；核心动作完成率与次日/7 日留存达预设基线；从哪一步流失有数据。未达门槛就上第二个端＝两个端同时出问题，最难修 |
| **阶段二：加固 + PWA 化** | 让 web 本身具备"接近 App"的体验，不建原生壳 | manifest（名称/图标/start_url/display/theme_color/scope）+ service worker（应用壳与静态资源 cache-first、数据 network-first、明确离线兜底页）；音频 spike（§8.3 风险 1：自动播放/后台播放/缓存） | 安装漏斗每一环（触发提示→点击→完成）有埋点；失败路径（缓存过期、请求中断、登录态切换、旧版已安装应用）测过并给出"刷新到新版"路径；**音频在 iOS Safari/Android 各主流 WebView 验证通过** |
| **阶段三：移动壳** | 拿到 iOS/Android 存在感，UI 零重写 | `apps/mobile` = Capacitor 8 壳装 `apps/web` 产物（§2）；原生插件只接确有必要的能力（推送、音频后台） | **量化门槛（全部满足才做）**：移动端流量占比与会话频次证明手机是主入口；移动端核心动作完成率相对 web 的缺口可归因于设备能力缺失；存在必须依赖 GPS/相机/生物识别/推送/离线才成立的核心流程；商店渠道对获客有实际贡献。否则停在 PWA |
| **阶段四：桌面壳** | 覆盖桌面场景，边际成本最低 | `apps/desktop` = Tauri 2 壳装同一产物（§3）；签名与分发渠道按平台配置 | 桌面端确有文件系统/本地存储/脱机/系统集成刚需；阶段三代码分割已就绪；团队有能力维护第 4 个端（端数硬约束） |

> 阶段二～四的顺序可以因数据调整，但**阶段一的准入门槛不能跳**——PMF 未验证就上原生，会把验证期的迭代速度拖垮（§10.3 失败模式 1）。注意阶段二不是纯技术任务：PWA 采用率数据（§10.2）说明"加个 manifest 就算 PWA"是自欺，要做就做到完整可安装配置。

### 10.2 关键门槛的一手依据

**PWA 采用率（Web Almanac 2025，2026-01 发布、2026-05 更新；2025-07 抓取 1,720 万站点）：**
- service worker 覆盖约 18.9%–20% 站点（2022 年仅约 1.7%，约 10 倍增长，但很大一部分增长来自 Google Tag Manager 被动启用，而非有意做 PWA）；
- manifest 约 9%，三年基本持平；
- **同时具备 manifest + 已注册 service worker 的"完整 PWA"只有桌面 3.3%、移动 3.5%**——所以阶段二若只加 manifest，等于落在 95%+ 的"半吊子"区间。
- 口径提示：2025-07 起 Chromium 的安装提示主要看有效 manifest + HTTPS，不再强制 service worker；因此 3.5% 不等于"可安装率"，但真正离线仍需 service worker。

**Capacitor 的定位（官方文档 v8）：** 官方自称"cross-platform native runtime for web apps"，让 web-first 团队"stay as close to web standards as possible"同时保留原生 SDK 访问；"If it works in the browser, it probably works in a mobile app"。这坐实了阶段三"UI 零重写、只接必要原生能力"的可行性，也说明桥接层应保持薄。

**Apple 审核规则（App Review Guidelines §4.2 Minimum Functionality）：** 原文要求 App 必须包含"features, content, and UI that elevate it beyond a repackaged website"，否则"doesn't belong on the App Store"；4.2.2 限制纯营销材料/web clippings/链接聚合；4.2.3 要求 App 能独立运行。**关键判断：这是定性标准，官方并未逐条强制"原生导航/隐藏 web chrome/离线/平台特性"**——所以"网站打包必被拒"是过时的恐吓；真实要求是证明有超越网页的价值。对本项目的含义：阶段三要有确凿的原生增值（推送、后台音频、离线复习），而不只是换个壳。

**桌面分发（Tauri 官方 Distribute 文档）：** 覆盖 Windows（Microsoft Store / Windows Installer）、macOS（App Store / DMG，**两者都需签名，站外分发还需公证**）、Linux（Debian/RPM/Snap/AppImage/Flatpak/AUR）、Android（Google Play）、iOS（App Store），并支持 CrabNebula 等云服务做全球分发 + 自动更新。阶段四的签名与渠道成本要提前计入（Apple Developer $99/年、Google Play 一次性 $25 为平台侧固定成本）。

### 10.3 成本—能力对照与失败模式

| 路径 | 商店上架 | 离线 | 设备 API | Web 代码复用 | 典型工期 |
| --- | --- | --- | --- | --- | --- |
| 纯 PWA（阶段二） | 不进商店 | 做好 SW 后较强 | 受浏览器限制 | 完全 | 数天～2 周 |
| Capacitor 壳（阶段三） | iOS/Android | 需主动设计缓存 | 桥接覆盖大部分 | 几乎全部 | 1–3 周 |
| Expo/RN 重建（远期兜底，§2） | iOS/Android | 可控性强 | 完整（原生模块） | 仅逻辑层 | 6–12 周 |
| Tauri 壳（阶段四） | 桌面各渠道 | 是 | 系统级 | 几乎全部 | 1–4 周 |

**提前规避的失败模式：** ① PMF 未验证就上移动端，拖垮验证速度；② 后端与界面耦合，加端变成重构产品（§8.4 的隔离原则就是解药）；③ 把 Capacitor 壳当免费转换、不做迁移规划，桥接层变成长期技术债——应设桥接依赖白名单和"是否继续以 web 为主"的决策日期；④ 忽视 Apple §4.2 的定性要求，被拒后临时加原生功能；⑤ 桌面端另起炉灶重写，其实 Tauri 一天就能包出可用版本；⑥ 把大陆可访问性（§9）拖到上线前——它应在选型期就按"用户在哪里"决定备案 + 国内节点。

### 10.4 与 ADR 的关系

§9、§10 的结论与 §1–§8 一样，最终应落成 `docs/adr/` 下的架构决策记录（本报告 TL;DR 上方已声明用途）。建议至少三条：**ADR-0001 主框架与 SPA 起步（§1）**、**ADR-0002 部署平台与大陆可访问性（§9）**、**ADR-0003 分阶段加端的量化门槛（§10）**。ADR 只记决策与理由，细节留在报告里，两者用链接互指。

---

## 参考来源（一手来源；§1–§8 核实日期 2026-11-19，§9–§10 核实日期 2026-11-20）

**框架版本与发布**
1. React 19.3.1（npm）：https://registry.npmjs.org/react/latest ；Releases（19.3.0，2026-09-09；19.3.1，2026-10-14）：https://github.com/facebook/react/releases/tag/v19.3.1 、https://github.com/facebook/react/releases/tag/v19.3.0
2. Next.js 16.4.6（2026-11-09）：https://github.com/vercel/next.js/releases/tag/v16.4.6
3. Vite 8.3.8：https://registry.npmjs.org/vite/latest
4. Vue 3.5.45（2026-11-05）：https://github.com/vuejs/core/releases/tag/v3.5.45
5. Nuxt 4.6.4（2026-11-02）：https://github.com/nuxt/nuxt/releases/tag/v4.6.4
6. Svelte 5.58.0（2026-11-18）：https://github.com/sveltejs/svelte/releases/tag/svelte%405.58.0 ；SvelteKit adapter-node 6.0.5 / kit 3.4.0（2026-11-18）：https://github.com/sveltejs/kit/releases/tag/%40sveltejs/adapter-node%406.0.5
7. Solid 2.0 稳定（2026-11-16，SolidStart 废弃并入 start mode）：https://www.solidjs.com/blog/solid-2-0-the-long-hold 、https://docs.solidjs.com/ 、https://docs.solidjs.com/migration/from-solid-start
8. Angular 22.3.0（2026-11-18）：https://github.com/angular/angular/releases/tag/v22.3.0
9. Astro 7.4.13：https://registry.npmjs.org/astro/latest
10. Expo SDK 58（expo@58.0.26，React 19.3.0 / RN 0.88.1）：https://registry.npmjs.org/expo/latest 、https://github.com/expo/expo/releases/tag/expo-template-blank-typescript%4058.0.35

**移动 / 桌面壳**
11. Capacitor 8.6.2（2026-11-12）：https://github.com/ionic-team/capacitor/releases/tag/8.6.2 ；概述（同构插件 API）：https://capacitorjs.com/docs ；PWA 一等支持：https://capacitorjs.com/docs/web/progressive-web-apps
12. Tauri 2.0 稳定（2024-10-02，iOS/Android 支持与插件稳定性声明）：https://v2.tauri.app/blog/tauri-20/ ；Tauri 2.12（2026-09-26，MSRV 1.90、弃 Win7、Android 模板迁移）：https://v2.tauri.app/blog/tauri-2.12/ ；CLI 2.12.6（2026-11-18）：https://github.com/tauri-apps/tauri/releases/tag/tauri-cli-v2.12.6
13. Tauri Updater 插件（平台支持表含 Win/Linux/macOS/Android/iOS）：https://v2.tauri.app/plugin/updater/
14. Electron 45.4.1（2026-11-19）：https://github.com/electron/electron/releases/tag/v45.4.1 ；自动更新文档（Squirrel、update.electronjs.org 限制、Linux 无内建）：https://www.electronjs.org/docs/latest/tutorial/updates

**Monorepo / UI / 运行时**
15. Turborepo 2.11.13（2026-11-18）：https://github.com/vercel/turborepo/releases/tag/v2.11.13 ；文档（框架无关、增量采用）：https://turborepo.dev/docs
16. Nx 23.3.2（2026-11-12）：https://github.com/nrwl/nx/releases/tag/23.3.2
17. shadcn/ui（129k★，"Foundation for your Design System"）：https://ui.shadcn.com/
18. Node.js 发布线（26 为 LTS，26.13.1 2026-11-11；24 于 2026-10-20 转 maintenance）：https://endoflife.date/nodejs

**后端 / 本地数据**
19. Supabase 免费项目 7 天暂停策略（官方）：https://supabase.com/docs/guides/platform/free-project-pausing ；定价（Free/Pro $25 起，付费不暂停）：https://supabase.com/pricing
20. RxDB 17.6.0（npm latest；exports 含 storage-dexie/sqlite 与 replication-supabase/firestore 等插件）：https://registry.npmjs.org/rxdb/latest
21. PowerSync 定价（Free 层 1 周不活跃停用、2GB/月、50 并发；Pro $49 起；源库 Postgres/MongoDB/MySQL/SQL Server）：https://www.powersync.com/pricing
22. Electric Sync（读路径 Postgres 同步、TanStack DB、PGlite、自托管）：https://electric.ax/docs/sync/
23. SQLite 官方 WASM 子项目与持久化（OPFS；wa-sqlite 为 OPFS 先驱）：https://sqlite.org/wasm/doc/trunk/index.md

**部署（§9，核实日期 2026-11-20）**
24. EdgeOne Pages 套餐对比（专业版 ¥140/月刊例、限时 5 折、140,000 MU；免费版不保 SLA）：https://pages.edgeone.ai/zh/document/billing-plan-comparison ；限制与配额（免费版 500 构建/月、单文件 25MB、自定义域名 200、Edge Functions 300 万次、商业化后可能调整）：https://pages.edgeone.ai/zh/document/limits-and-quotas
25. Cloudflare Pages 定价页（各档带宽/sits/seats 不限量；Free 500 构建、Pro 5,000、Business 20,000；自定义域 100/250/500）：https://www.cloudflare.com/developer-platform/products/pages
26. Netlify 定价页（credit 池制：Free 300 / Personal 1,000 / Pro 3,000–20,000 credits；带宽 20 credits/GB、生产部署 15 credits/次；Deploy Previews 全档无限；Pro 不限成员）：https://www.netlify.com/pricing/
27. Vercel 定价文档（Pro $20/seat/月；构建 $0.0035/CPU 分钟；预览后缀 $100/月、Advanced Deployment Protection $150/月、SAML $300/月等加购）：https://vercel.com/docs/pricing
28. 大陆可访问性实测（GreatFire：vercel.app 3/3 blocked、194/194 URL blocked，最近 2026-11-04；netlify.app 5/5 可达，2026-10-01；Vercel 官方知识库自述无大陆节点、不保证大陆可用性）：https://www.chinawebfoundry.com/resources/china-web-guide/vercel-netlify-china ；Vercel 官方 KB：https://vercel.com/kb/guide/accessing-vercel-hosted-sites-from-mainland-china
29. EdgeOne vs Cloudflare 大陆实测（北京电信 4.2s→0.8s、上海联通 5.1s→0.9s、广州移动 4.8s→0.7s；Cloudflare 无大陆节点）：https://tux.fan/zh/2026/07/06/cloudflare-to-edgeone-makers-migration/
30. 海外平台 CNAME 优选方案（每 40 分钟刷新、延迟 300ms+→30–40ms；属绕过式优化，稳定性无保障）：https://yesnotes.net/articles/a-cname-level-fix-for-slow-vercel-netlify-and-cloudflare-sites-in-china.html

**迭代规划（§10，核实日期 2026-11-20）**
31. Web Almanac 2025 PWA 章（2026-01 发布、2026-05 更新；2025-07 抓取 1,720 万站点；SW 约 18.9%–20%、manifest 约 9%、完整 PWA 桌面 3.3%/移动 3.5%；Chromium 安装提示现已主要看 manifest+HTTPS）：https://almanac.httparchive.org/en/2025/pwa （注：2024 版无 PWA 章，见 https://almanac.httparchive.org/en/2024/table-of-contents ）
32. Capacitor v8 官方文档（cross-platform native runtime for web apps；web-first、保留原生 SDK；"If it works in the browser, it probably works in a mobile app"）：https://capacitorjs.com/docs
33. Apple App Review Guidelines §4.2 Minimum Functionality（"elevate it beyond a repackaged website"；4.2.2/4.2.3 子条款；定性标准而非技术清单）：https://developer.apple.com/app-store/review/guidelines/
34. Tauri v2 Distribute 文档（Windows/MS Store+Installer、macOS/App Store+DMG 需签名公证、Linux 多格式、Android Google Play、iOS App Store、CrabNebula 云分发）：https://v2.tauri.app/distribute/
