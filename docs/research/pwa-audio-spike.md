# 阶段二 Spike：PWA 与音频（2026-11-21）

> 对应 `docs/research/framework-selection.md` §10.1 阶段二「加固 + PWA 化」。
> 本文只记**实测结论与未决项**，平台调研的原文口径与取舍理由仍留在那份选型报告里。

## 1. TL;DR

阶段二的工程部分已落地：完整可安装 manifest、手写 Service Worker（分层缓存）、图标三件套、安装引导、音频适配器重构（能力探测 / 手势解锁 / 后台保活 / 预录音频 Cache API 路径）、`?diag=1` 诊断页。

还补了**本地埋点队列**（IndexedDB 先落盘 + 可插拔 sink），让安装漏斗不再依赖后端就能采集。

自动化验证 **两套共 19 个环节、30 个单测全绿**：

- `pnpm verify:ui`（阶段一 9 环节）—— 主流程无回归；
- `pnpm verify:pwa`（阶段二 10 环节）—— manifest / 图标 / SW 注册 / 应用壳缓存 / 离线重载 / 能力探测 / 手势解锁 / 缓存往返 / 发音看门狗 / 埋点队列；
- `pnpm test` —— 30 个纯逻辑单测（domain 16 + audio 14）。

**但阶段二的准入门槛仍未完全达标**：埋点只有本地队列，远程 sink 要等后端；iOS Safari / Android WebView 的音频验证没有真机数据。后者不能靠无头 Chrome 冒充，见 §5。工具侧调研见 §6。

## 2. 为什么这样实现

### 2.1 PWA

| 决策 | 依据 |
| --- | --- |
| manifest 同时给 192/512 `any` + 512 `maskable` | Chrome 安装对话框要求至少一张 ≥144px 的 PNG 且 `purpose` 含 `any`；Android 自适应图标需要 maskable。 |
| `id: "/"`、`start_url: "/?source=pwa"`、`scope: "/"` | `id` 与 `start_url` 解耦，将来改启动参数不会让已安装应用变成"另一个应用"。 |
| `display: standalone` + `display_override` | iOS 16.4–18 认 `display: standalone` 才进 web-app 模式；旧版本靠 `apple-mobile-web-app-capable` meta 兜底。 |
| 手写 SW 而非引 Workbox | 当前只有四类请求（导航 / 指纹资源 / 图标 / 数据），策略简单；不为一个 4KB 的 SW 引入构建期依赖。**若将来要处理 range 请求、不透明响应或推送，应改用 Workbox**——这是权衡，不是原则。 |
| SW 仅在 PROD 注册 | dev server 下 SW 会缓存住模块、破坏 HMR；需要调试时 `localStorage['atomic:sw']='1'`。 |
| iOS 不给安装按钮，只给图文引导 | Safari **不派发 `beforeinstallprompt`**，唯一路径是「分享 → 添加到主屏幕」。给按钮等于给人一个永远点不动的控件。 |

缓存策略按请求类型分层（不搞全局一把梭）：

| 请求 | 策略 | 理由 |
| --- | --- | --- |
| 导航 | network-first → 缓存的 `index.html` | 离线时应用壳仍可启动，IndexedDB 数据照常读 |
| `/assets/*` | cache-first | Vite 产物带内容哈希，不可变 |
| 图标 / manifest | stale-while-revalidate | 先显示再更新，不阻塞首屏 |
| `/api/*` | network-first + TTL 5min 缓存兜底 | 离线给陈旧数据好过报错，并打 `x-atomic-stale` 标记 |
| 跨域 | 不拦截 | Supabase 直连，交给浏览器 |

### 2.2 音频

把 `packages/audio` 从「一个 `speak()`」扩成三层：

1. **能力探测**（`getAudioCapabilities()`）：平台、语音数、Cache API、Media Session、自动播放策略，附 `notes` 直接列出已知限制；
2. **Web Speech 适配器**：
   - 首次手势调 `unlockAudio()`：唤醒合成器 + 启动静音保活音轨；
   - 长文本按句切成 ≤180 字符的 utterance（Chrome 对 >200~250 字符的单条会截断）；
   - 音色优先本地语音（`localService`），避免把听写内容发给云端语音；
   - 看门狗：iOS 上 `onend`/`onerror` 可能永不触发，按词数估算时长 +2s 兜底，并把结束原因（`ended`/`watchdog`/`stopped`/`error`）暴露给诊断页；
3. **预录音频适配器**：`HTMLAudioElement` + Cache API（`atomic-audio-v1`），支持 `prefetchAudio()` / `getCachedAudioUrl()`，为离线发音、母语音色、慢速版留好接口。

对外 `speak()` 签名不变，调用方（挑战页 / 复习页）只多了一句 `unlockAudio()`（必须在点击处理器的同步栈里）。

## 3. 已自动化验证（无头 Chrome 390×844）

| 环节 | 结果 |
| --- | --- |
| manifest 可解析、字段齐全、图标 192/512 + maskable | ✅ |
| 四张图标均为合法 PNG、尺寸正确 | ✅ |
| SW 注册于根作用域，shell 缓存含 `index.html`/manifest/四图标 | ✅ |
| 断网重载：挑战页仍渲染、离线提示条出现 | ✅ |
| 能力探测：语音合成 4 个语音、Cache API 可用、notes 非空 | ✅ |
| 手势解锁：`speech=true keepAlive=true` | ✅ |
| 音频缓存往返：写入 → 命中 16044 字节 → 条目数 1 | ✅ |
| 发音：结束原因 `ended`，耗时 4036ms | ✅ |
| 主流程回归：阶段一 9 环节、类型检查、生产构建、console 零错误 | ✅ |

诊断页入口：`http://127.0.0.1:5173/?diag=1`（生产构建同样可用）。
诊断结果暴露在 `window.__atomicDiag`，PWA 状态暴露在 `window.__atomicPwa`，供自动化断言。

## 4. 真机验证清单（**未执行，阶段二门槛项**）

无头 Chrome 只能证明"机制接好了"，证明不了 iOS 行为。以下必须在真机逐项跑：

| # | 平台 | 动作 | 期望 | 当前状态 |
| --- | --- | --- | --- | --- |
| 1 | iOS Safari | 首次点击播放 | 出声；`__atomicDiag.unlockResult` 为 `keepAlive=true` | ⏳ 待真机 |
| 2 | iOS Safari | 页面加载后不点击、直接尝试发音 | 静默失败（**已知限制**，UI 不应自动发音） | ⏳ 待真机 |
| 3 | iOS Safari | 播放中切到后台 / 锁屏 | 语音实际能否继续；保活音轨是否阻止合成器停摆 | ⏳ 待真机 |
| 4 | iOS Safari 主屏 PWA | 重复 #3 | 与 Safari 标签页行为是否一致（历史上独立 PWA 更易被暂停） | ⏳ 待真机 |
| 5 | iOS Safari | 分享 → 添加到主屏幕 | 全屏启动、图标正确、无 Safari 地址栏 | ⏳ 待真机 |
| 6 | Android Chrome | 安装提示触发 → 点击 → 完成 | 漏斗三环均有埋点 | ⏳ 待埋点 + 真机 |
| 7 | Android WebView / 第三方浏览器 | 播放、后台、缓存离线 | TTS 引擎差异（依赖系统语音包） | ⏳ 待真机 |
| 8 | 两端 | 飞行模式 → 打开已安装应用 → 复习 | 应用壳 + IndexedDB 数据可用；音频缓存命中 | ⏳ 待真机 |
| 9 | 两端 | 旧版已安装 → 发新版 | 更新提示出现 → 点击刷新 → 新资源生效 | ⏳ 待真机 |
| 10 | 两端 | 连续用完所有题目 → 重置 | 数据清空、状态回到第一题 | ✅ 自动化已覆盖（Chrome） |

> 若 #3/#4 证实语音合成在 iOS 后台仍会停，**结论是接受限制而非继续 hack**：核心学习动作是"听一句话立刻复述"，不需要后台连续播放；等产品数据证明有后台收听需求，再上预录音频 + Capacitor 原生音频会话（阶段三）。

## 5. 未达标项与后续

对照 §10.1 阶段二准入门槛：

- ⚠️ **安装漏斗每一环有埋点（本地完成，上报待后端）**：已建 `IndexedDB 队列 + 可插拔 sink`，覆盖 `install_prompt_shown` / `install_accepted` / `install_dismissed` / `install_unavailable` / `app_installed` / `install_banner_shown` / `pwa_offline_shown` / `sw_update_shown` / `audio_unlock`，并有 `diag_selftest` 做端到端自检。当前 sink 是 console，接 Supabase 时改成 `createHttpSink('/api/events')` 即可，业务侧调用不动。**但"上报成功"这件事目前无远端证据**，等后端上线后再验收这一条。
- ❌ **失败路径全测过**：缓存过期（`x-atomic-stale` 已实现但未测）、请求中断、登录态切换（暂无登录）、旧版已安装更新（UI 已实现但未做跨版本实测）。
- ❌ **iOS Safari / Android 各主流 WebView 音频验证**：见 §4 清单。
- ✅ manifest + SW + 离线兜底 + 音频机制 + 主流程无回归。

**因此阶段二处于"工程完成、验收未完成"状态。** 埋点通道已补完本地部分，剩下的硬阻塞只有真机验证（工具方案见 §6）。真机过了才讨论阶段三的移动壳，不提前加端。

## 6. 端侧验证工具链（2026-11-21 调研）

上一节的 10 项真机清单能不能落地，取决于手头有什么软件。结论：**工具不是主要瓶颈**——大部分能力免费或按量付费，真正的阻塞是「没有 iOS 真机 / 没有 Mac」和「埋点通道未接」。

### 6.1 几个会让人踩空的事实

- **Lighthouse 12.0（2024-05）起删掉了 PWA 分类。** 现在还在说「PWA 分数要 90+」的检查清单是过时的。安装性以 Chrome DevTools → Application → Manifest 面板为准；Lighthouse 剩下性能/可访问性/最佳实践/SEO 四类（来源 §工具链 1、2）。
- **「可安装」与「离线可用」是两件事。** Chrome 108(移动)/112(桌面) 起装应用不再要求 SW，所以装得上的应用完全可能断网白屏——这正是我们 `verify:pwa` 分开测这两项的原因。
- **Playwright 的 WebKit ≠ Safari。** 它只是 WebKit 引擎构建，能抓引擎级问题，抓不到 iOS 的音频会话、静音键、锁屏行为。别拿它当真机结论。
- **LambdaTest 已于 2026-01 更名为 TestMu AI**（lambdatest.com 跳转 testmuai.com），但文档里仍用 `LT_USERNAME` / `LT_ACCESS_KEY` 凭据；按旧名字找资料会迷路（来源 §工具链 3）。
- **Firebase Test Lab 已弃用，2027-09-30 关停**，官方指向 Google Cloud 的 Developer Device Platform；现在不要为它投入。
- **SW 要求安全上下文（HTTPS 或 localhost）。** 真机访问开发机必须走 HTTPS 隧道（ngrok / localtunnel / cloudflared）或直接部署测试环境。Android 上用 `10.0.2.2` 模拟器地址不是安全上下文，SW 会失效；用 `adb reverse` 把端口映射成设备上的 localhost 才靠谱（来源 §工具链 5）。

### 6.2 工具矩阵

| 用途 | 工具 | 成本 | 本机可用 | 能证明什么 | 局限 |
| --- | --- | --- | --- | --- | --- |
| 安装性 / manifest / SW / Cache Storage | Chrome DevTools → Application 面板 | 免费 | ✅ | 安装条件逐条判定、SW 生命周期、缓存内容 | 只有 Chromium；iOS 不适用 |
| 在线 PWA 审计 | PWABuilder（微软） | 免费 | ✅ | manifest 语法、SW 健康度、跨端建议 | 静态分析，不能证明真机行为 |
| iOS Safari 真机调试（最佳） | Safari Web Inspector + Mac | 免费 | ❌ 需 Mac | DOM/控制台/网络/Service Worker/主屏 Web App 全能力 | Apple 生态锁定，Windows/Linux 无解 |
| iOS Safari 调试（无 Mac 开源） | `ios-webkit-debug-proxy` + `ios-safari-remote-debug-kit` | 免费开源 | ✅ | 补丁版 Web Inspector 跑在 Chrome/Edge 里，连真机 Safari | Timelines Events 视图不可用、canvas 图形页有缺陷；需 iTunes/Apple Devices 驱动 |
| iOS Safari 调试（无 Mac 商业） | Inspect CLI（`npm i -g @inspectdotdev/cli`） | 免费额度 + 付费 | ✅ | 真机 CLI、结构化 JSON、可交棒给 Chrome DevTools | 免费额度每日短会话有限 |
| iOS/Android 云真机（海外） | BrowserStack Live / Automate | 约 $29/月起（Live）、$99/月（Automate，真机更高） | ✅ | 云端真 iPhone/iOS Safari，Safari DevTools 浮窗 | 远程机器不是用户手里那台；大陆访问按域名波动 |
| iOS/Android 云真机（海外低价） | TestMu AI（原 LambdaTest） | 约 $15/月起 | ✅ | 同上，价格约为 BrowserStack 的 30–50% | 真机池深度弱于 BrowserStack |
| 安卓云真机（国内） | 腾讯 WeTest / 阿里 MQC / Testin 云测 | 约 ¥0.5–3/分钟，新用户/企业认证常送时长 | ✅ | 大陆可达、国产机型覆盖（华为/小米/OPPO/vivo）、按量付费 | iOS 机型占比低（MQC 约 40+ 台、WeTest 约 20+ 台）；Web Inspector 级调试能力需逐家确认 |
| Android Chrome / WebView 调试 | `chrome://inspect` + adb | 免费 | ✅ | DOM/控制台/网络/Application/屏幕镜像；WebView 需 `setWebContentsDebuggingEnabled(true)` 且只在 debug 包开 | 需要数据线 + USB 调试授权；WebView 目标默认不可见 |
| 页内日志兜底 | Eruda / vConsole（注入 script） | 免费开源 | ✅ | 手机上直接看 console/错误/网络，不依赖 Mac 或代理 | 看不到 Service Worker 内部，不能替代调试器 |
| HTTPS 隧道 | ngrok / localtunnel / cloudflared | 免费档可用 | ✅ | 让真机访问本地 dev server 且满足 SW 安全上下文 | 免费域名会变；大陆访问质量各异 |
| 音频后台 / 锁屏行为 | **无专用工具**，真机手工 + 系统 UI 观察 | 0 | 部分 | 控制中心「正在播放」卡片、锁屏媒体控件、静音键、低电量模式 | 只能靠人肉流程 + 截图留证；无法自动化断言 |

> 来源均为厂商文档或 2026-10/11 实查的价格页；云厂商定价频繁变动，采购前需重查官网（见 §7 工具链来源）。

### 6.3 针对我们 10 项清单的推荐组合

按「先零成本、后付费」排：

1. **零成本先跑**：`verify:pwa` 已覆盖的 6 项（manifest/图标/SW/离线/缓存/发音机制）+ Chrome DevTools Application 面板人工复核 + Android 真机 `chrome://inspect`（adb）+ 页内注入 Eruda + HTTPS 隧道。
2. **iOS 无 Mac 时**：优先 Inspect CLI 免费额度；不够再上 `ios-webkit-debug-proxy` + 补丁 inspector（免费但配置繁琐）；只为「iOS 到底能不能装/能不能播」做一次性确认时，买 BrowserStack Live 短会话更省时间。
3. **国产安卓机型覆盖**：腾讯 WeTest 或阿里 MQC 新用户赠送时长足够跑一轮功能验证，按分钟计费不会有沉没成本。
4. **音频后台 #3/#4**：只能真机手工。检查顺序固定为——关闭低电量模式 → 点击播放满 3 秒 → 看控制中心「正在播放」卡片是否出现 → 锁屏 → 唤醒锁屏看媒体控件 → 按键测音量条是否响应。静音键**不**静音媒体音频，别用它当判据。

### 6.4 对阶段二门槛的影响

工具侧没有硬阻塞：开源方案能覆盖 iOS 调试，国内云真机能低成本覆盖安卓机型。埋点本地部分已补完，剩下真正要投入的是「一台 iOS 真机（或一次云真机会话）」和「后端的事件接收端点」。所以维持上一节结论不变：**真机验证过了才谈阶段三**。

## 7. 主要来源

**Speech Synthesis / iOS 限制**

- MDN `SpeechSynthesis`：https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis
- WebOutLoud《Current Issues with Speech Synthesis in Safari》（Safari 15.4 后台停摆、getVoices 为空、音色切换无效）：https://weboutloud.io/bulletin/speech_synthesis_in_safari/
- LambdaTest《Speech Synthesis API: Browser Support, Voices, Limitations》（iOS 手势要求、Chrome 长句截断、voiceschanged、Firefox Android 无合成）：https://www.lambdatest.com/web-technologies/speech-synthesis-chrome
- Andrew Usher《Give Your Web App a Voice》（iOS 限制矩阵）：http://andrewusher.dev/blog/give-your-web-app-a-voice

**iOS 后台音频保活**

- Hacker News 讨论（持续静音轨 / MediaStreamAudioDestinationNode 绕过熄屏）：https://news.ycombinator.com/item?id=44063377
- Stack Overflow《iOS PWA Background Audio Support》（独立 PWA 比 Safari 标签更易被暂停；iOS 15.4 修复部分问题）：https://stackoverflow.com/questions/60003027/ios-pwa-background-audio-support/71413598
- shush-app 实现参考（双 audio 元素无缝衔接 + Media Session）：https://github.com/carmi/shush-app

**PWA 安装与缓存**

- OpenPWA 安装条件（Chrome 108/112 起不再把 SW 当安装条件）：https://openpwa.net/reference/installation/installability-criteria
- OpenPWA `beforeinstallprompt`（Safari/Firefox 不派发、`prompt()` 需用户激活）：https://openpwa.net/reference/installation/install-prompt
- PWA Directory《Why is my PWA not installable?》（192/512 双图标、iOS 只有分享菜单路径）：https://pwa.directory/blog/why-is-my-pwa-not-installable
- Progressive Web App installability guideline（分层缓存策略、iOS 存储可被 7 天清理、Background Sync 不可用）：https://agenticdevelopercookbook.com/guidelines/implementing/ui/progressive-web-app

**端侧验证工具链（2026-11-21 实查）**

1. CloudQA《Testing Your PWA: A 2026 Guide》（Lighthouse 12.0 移除 PWA 分类；「可安装」与「离线可用」要分开测）：https://cloudqa.io/?p=10001
2. CodeGenes《PWA Install Button Not Showing》（DevTools Application 面板是安装性权威；PWABuilder 在线审计；Android WebAPK 与图标要求）：https://www.codegenes.net/blog/progressive-web-app-not-showing-install-button-in-browser-bar
3. QAble《BrowserStack alternatives》（2026-10-13 实查价格；LambdaTest→TestMu AI 更名；Firebase Test Lab 2027-09-30 关停；Playwright WebKit ≠ Safari）：https://www.qable.io/knowledge-hub/comparisons/browserstack-alternatives
4. 《Debugging iPhone Safari and web views without a Mac》（ios-webkit-debug-proxy、ios-safari-remote-debug-kit、Inspect CLI、BrowserStack Live、Eruda/vConsole 的可用范围与缺陷）：https://apps.cihat.dev/blog/debug-iphone-safari-without-mac
5. MacMyths《Chrome Remote Debugging》（chrome://inspect、WebContentsDebuggingEnabled、adb reverse 与安全上下文、Android 11+ 无线调试）：https://macmyths.com/chrome-remote-debugging-a-developers-guide
6. 《iOS PWA Background Audio Support》与 WeTest/MQC/Testin 定价资料（国内云真机按 ¥0.5–3/分钟计费、iOS 机型占比与赠送时长）：https://stackoverflow.com/questions/60003027/ios-pwa-background-audio-support/71413598 、https://www.codenong.com/cs106523310 、https://cloud.tencent.com/developer/article/2635427
