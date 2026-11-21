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
| 音频 | Web Speech API | WebView 的 Web Speech（受设备 TTS 引擎影响） |
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

## Release 签名（上架用）

1. 生成 keystore：

   ```bash
   keytool -genkeypair -v -keystore release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias atomic
   ```

2. 在 `android/app/build.gradle` 的 `android { signingConfigs { release { ... } } }` 配置 keystore 路径与密码（从环境变量读，不硬编码进仓库）。
3. `cd apps/mobile/android && ./gradlew assembleRelease`

签名凭据绝不入库。

## 已知限制

- **Android WebView 的 Web Speech**：发音音色与行为取决于设备安装的 TTS 引擎，和 Chrome/iOS Safari 不完全一致。真机需按 `pwa-audio-spike.md` 的清单验证。
- **混合内容**：`capacitor.config.ts` 设了 `mixedContentMode: always` 以便本地联调 http 后端；正式版用 https 后应收紧为默认。
- **自动更新**：Capacitor 壳本身不走 Web 的热更新逻辑，改代码需重新出 APK。
