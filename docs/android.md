# Android 端构建指南

Atomic English 的 Android 端是 **Capacitor 8 壳**：把 `apps/web` 的生产构建产物装进 Android WebView，Web 代码 100% 复用，领域逻辑仍在 `packages/*`。没有另起一套原生 UI。

## 为什么是 Capacitor 壳而不是原生重写

选型结论见 [`framework-selection.md`](research/framework-selection.md) §2：

- 同一套代码覆盖 Web / Android（未来 iOS 也是同一份），维护成本最低
- 核心学习动作是「听一句话 → 打字 → 判分」，WebView 完全够用
- 原生能力（音频会话、文件、推送）通过 Capacitor 插件按需加，不提前加

代价：重度依赖 WebView 性能与音频行为，iOS 后台音频等限制仍受平台约束（见 `pwa-audio-spike.md` §4）。若将来真机证明 WebView 撑不住，再按文档升到 Expo/RN 重写 UI 层——领域层不动。

## 目录结构

```
apps/mobile/
├── capacitor.config.ts   # appId / appName / webDir
├── android/              # cap add android 生成的原生项目（已入库）
└── package.json          # cap sync / build / open 脚本
```

`webDir` 指向 `../web/dist`，所以构建顺序是：**先 build web，再 cap sync**。

## 构建 APK

### 前置：JDK 21 + Android SDK

Capacitor 8 的 Android 构建要求 **JDK 21**（源码目标 21，用 JDK 17 会以「无效的源发行版：21」失败）。本机用 Adoptium JDK 21 即可，`JAVA_HOME` 指向它。

Android SDK 需要 Platform 36 + Build Tools 36 + Platform Tools。两种方式：

- **方式 A（推荐）**：装 Android Studio，它自带 SDK，并配置 `ANDROID_HOME`。
- **方式 B（纯命令行）**：下载 Android command-line tools，用 `sdkmanager` 装 `platforms;android-36` 和 `build-tools;36.0.0`，设置 `ANDROID_HOME` 指向 SDK 根目录。

项目根目录会生成 `apps/mobile/android/local.properties`（`sdk.dir=...`）——这是本地文件，已 gitignore，不入库。

### 一条命令构建

```bash
# 在仓库根目录
pnpm android:build
```

脚本会自动探测 JDK 21 与 Android SDK 并写好 `local.properties`，依次执行：build web → `cap sync android`（复制静态资源 + 同步插件）→ `gradlew assembleDebug` → 把 APK 复制到 `artifacts/`。若自动探测失败，按报错设置 `JAVA_HOME` 或 `ANDROID_HOME` 再跑一次。

产物：`apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`（另复制到 `artifacts/atomic-english-debug.apk` 方便取用）。

已在本机实测构建成功：包名 `com.atomic.english`、label `Atomic English`、minSdk 24 / targetSdk 36、大小约 4.2 MB，内含 `assets/public/*` 全部 Web 资源。

### 安装到设备

```bash
# 设备已开启 USB 调试并连接
adb install artifacts/atomic-english-debug.apk
```

Debug APK 用 Capacitor 默认签名，可直接装；上架需要用自己的 keystore 签 Release（见下）。

### 在 Android Studio 里打开

```bash
pnpm android:open
```

## 与 Web 端的关系

| 维度 | Web（浏览器/Docker） | Android 壳 |
| --- | --- | --- |
| 代码 | `apps/web` | 同一份 `apps/web/dist` |
| 后端地址 | 运行时 `/config.js` 注入 | 同左（在打包前生成 config.js） |
| 本地数据 | IndexedDB | WebView 的 IndexedDB |
| 云同步 | Supabase Auth | 同左（WebView 内 localStorage 持久化会话） |
| 音频 | 预录音频优先 + Web Speech 兜底 | 同一套代码 + 内置音频（不依赖设备 TTS） |
| 更新 | 重新构建镜像/静态资源 | 重新构建 APK 并安装 |

**注意 config.js**：Capacitor 里没有 nginx 容器来动态生成 `/config.js`，WebView 直接读打包进去的 `apps/web/public/config.js`（本地占位，不注入真实 key）。要让 Android 版连上后端，构建前需要生成带真实配置的 `config.js`。做法是：

```bash
# 在 web 的 public 目录生成注入了后端的 config.js（示例）
cat > apps/web/public/config.js <<'EOF'
window.__ATOMIC_CONFIG__ = {
  supabaseUrl: "https://your-supabase.example.com",
  supabaseAnonKey: "sb_publishable_..."
};
EOF
pnpm android:build
```

这份 `config.js` 会被 `cap sync` 复制进 APK。它含的是 Publishable key（设计上可公开，RLS 按 uid 隔离），不是 Secret key。**不要把 `sb_secret_*` 写进去。**

## 音频与离线（Web / Android 能力一致）

**问题**：Android WebView 依赖系统 TTS 引擎，国产 ROM 常无英文语音包，`speechSynthesis.speak()` 静默失败——表现为"动画播完但没声音"。这在手机浏览器（Chrome 有 Google TTS）上不明显，但在 APK 里必现。

**方案**：两端共用同一条降级链，实现在 `@atomic/audio` 的 `PrerecordedProvider`：

```
文本命中预录音频 manifest → <audio> 播放本地 mp3（主路径，离线可用）
        ↓ 未命中（新题未生成 / 动态文本）
Web Speech API 实时合成（兜底，行为与旧版一致）
```

- **预生成**：`scripts/generate-audio.py` 用 Edge TTS（微软在线语音，免费无密钥）把 30 道题句子 + 182 个去重词生成 mp3，写入 `apps/web/public/audio/`，并产出 `manifest.json`（文本→URL 映射）。新增题目后需重跑 `pnpm audio:generate`。
- **随产物分发**：`apps/web/dist/audio/` 被 `cap sync` 复制进 APK 的 `assets/public/audio/`，共 212 条、约 3MB。Web 端由 SW 以 cache-first 惰性缓存（播过即离线可听）；APK 内置资源天然离线。
- **启动时序**：`main.tsx` 在 `loadAudioManifest()` 完成后才渲染，保证首次点播放就能命中本地音频，不会掉进无声的兜底路径。
- **诊断**：`?diag=1` 页显示"预录音频 N 条 · 离线可播"，`window.__atomicDiag.capabilities` 含 `audioManifestLoaded` / `audioEntryCount`。
- **验证**：`pnpm verify:audio` 确认点播放真的请求了 mp3、manifest 加载、诊断状态正确。生产构建预览同样通过，与 APK 走同一路径。

代价：换音色/语速要重新生成音频并重出包；这是"离线可靠"换来的确定性与可控性。若将来需要任意文本发音（如用户自创句子），仍需 Web Speech 兜底——那条路径在真机上的限制由 `pwa-audio-spike.md` §4 记录。

## 在电脑上调试真机 APK

不用模拟器——USB 连一台 Android 手机即可在电脑上装包、截屏、看日志、甚至调试 WebView 内部的 DOM。前提：手机开启「开发者选项 → USB 调试」并用 USB 连到电脑，授权调试。

`scripts/android-debug.sh` 封装了常用操作（自动发现已授权设备）：

```bash
bash scripts/android-debug.sh                    # 安装最新 APK 并启动（默认 all）
bash scripts/android-debug.sh <设备号> install    # 只重装 APK（改代码后）
bash scripts/android-debug.sh <设备号> start      # 只启动
bash scripts/android-debug.sh <设备号> shot       # 截屏到 .workbuddy/phone-screen.png
bash scripts/android-debug.sh <设备号> log        # 实时 logcat（查崩溃/报错）
bash scripts/android-debug.sh <设备号> cdp        # 转发 WebView 调试端口
bash scripts/android-debug.sh <设备号> verify-audio  # 端到端验证 APK 内音频走预录 mp3
```

设备号可由 `adb devices` 查到；不传则自动取第一台已授权设备。

**调试 WebView 内部**（确认手机端真实行为的关键手段）：debug 构建的应用 WebView 暴露 CDP，`cdp` 子命令把它的调试端口转发到 `http://127.0.0.1:9222`，然后：

- 浏览器打开 `chrome://inspect` → Devices → 找到 Atomic English → **inspect**，可像 DevTools 一样看 DOM、Console、Network；
- 或跑 `verify-audio`：脚本连进 WebView，点播放后检查是否请求了 `/audio/challenge-*.mp3`，以此证明 APK 走的是预录音频而非无声的 Web Speech 兜底。

这套方法是**真机实测**，比无头 Chrome 更能证明手机端行为。本机实测：Redmi（Android 15）上点播放后 WebView 请求了 `challenge-594.mp3`、manifest 加载成功、音频缓存存在、按钮进入播放态——预录音频链路在 APK 内真实生效。

常见问题：
- `adb devices` 看不到设备 → 检查 USB 调试授权、数据线是否支持传输；
- 端口 5037 冲突 → 结束残留 adb 进程（`adb kill-server` 后重试）；
- `cdp` 连不上 → 确认应用已启动且是 debug 构建（Release 签名包默认不可调试）。

## Release 签名（上架用）

1. 生成 keystore：

   ```bash
   keytool -genkeypair -v -keystore release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias atomic
   ```

2. 在 `android/app/build.gradle` 的 `android { signingConfigs { release { ... } } }` 配置 keystore 路径与密码（从环境变量读，不硬编码进仓库）。
3. `cd apps/mobile/android && ./gradlew assembleRelease`

签名凭据绝不入库。

## 已知限制

- **动态文本的 Web Speech 兜底**：课程内句子/单词已走内置预录音频，不依赖设备 TTS；只有 manifest 未命中的动态文本才回退到 Web Speech，此时受设备 TTS 引擎影响。核心学习路径已避开该限制。
- **混合内容**：`capacitor.config.ts` 设了 `mixedContentMode: always` 以便本地联调 http 后端；正式版用 https 后应收紧为默认。
- **自动更新**：Capacitor 壳本身不走 Web 的热更新逻辑，改代码需重新出 APK。
