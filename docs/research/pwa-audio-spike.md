# 阶段二 Spike：PWA 与音频（2026-11-21）

> 对应 `docs/research/framework-selection.md` §10.1 阶段二「加固 + PWA 化」。
> 本文只记**实测结论与未决项**，平台调研的原文口径与取舍理由仍留在那份选型报告里。

## 1. TL;DR

阶段二的工程部分已落地：完整可安装 manifest、手写 Service Worker（分层缓存）、图标三件套、安装引导、音频适配器重构（能力探测 / 手势解锁 / 后台保活 / 预录音频 Cache API 路径）、`?diag=1` 诊断页。

自动化验证 **两套共 18 个环节、14 个单测全绿**：

- `pnpm verify:ui`（阶段一 9 环节）—— 主流程无回归；
- `pnpm verify:pwa`（阶段二 9 环节）—— manifest / 图标 / SW 注册 / 应用壳缓存 / 离线重载 / 能力探测 / 手势解锁 / 缓存往返 / 发音看门狗；
- `pnpm --filter @atomic/audio test` —— 14 个纯逻辑单测（切片、音色选择、WAV 头）。

**但阶段二的准入门槛尚未达标**：安装漏斗埋点未接（后端未上线），iOS Safari / Android WebView 的音频验证没有真机数据。这两项不能靠无头 Chrome 冒充，见 §5。

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

- ❌ **安装漏斗每一环有埋点**：目前只有 `window.__atomicPwa` 状态快照，没有事件上报。后端（Supabase 本地栈）尚未接入，等阶段一埋点通道建好后一并补 `install_prompt_shown` / `install_accepted` / `install_dismissed`。
- ❌ **失败路径全测过**：缓存过期（`x-atomic-stale` 已实现但未测）、请求中断、登录态切换（暂无登录）、旧版已安装更新（UI 已实现但未做跨版本实测）。
- ❌ **iOS Safari / Android 各主流 WebView 音频验证**：见 §4 清单。
- ✅ manifest + SW + 离线兜底 + 音频机制 + 主流程无回归。

**因此阶段二处于"工程完成、验收未完成"状态。** 下一步建议：先补埋点通道（属于阶段一遗留），再安排一轮真机测试；两项都过了才讨论阶段三的移动壳，不提前加端。

## 6. 主要来源

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
