#!/usr/bin/env bash
# 构建 Android Debug APK。自动探测 JDK 21 与 Android SDK，本机无需手动设环境变量。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# 1. 探测 JDK 21（Capacitor 8 要求源码目标 21）
# 环境里可能预设了 JDK 17，必须校验主版本，不能盲信 JAVA_HOME
java_major() {
  local j="$1"
  "$j/bin/java" -version 2>&1 | head -1 | sed -E 's/.*"([0-9]+).*/\1/'
}
detect_jdk21() {
  for candidate in /d/Compilers/jdk-21* "$HOME/.jdks/jdk-21"* "/c/Program Files/Java/jdk-21"* /usr/lib/jvm/java-21*; do
    if [ -x "$candidate/bin/java" ] && [ "$(java_major "$candidate")" = "21" ]; then
      printf '%s' "$candidate"
      return 0
    fi
  done
  return 1
}
if [ -z "${JAVA_HOME:-}" ] || [ "$(java_major "$JAVA_HOME" 2>/dev/null || echo 0)" != "21" ]; then
  if FOUND=$(detect_jdk21); then
    JAVA_HOME="$FOUND"
  else
    echo "未找到 JDK 21（当前 JAVA_HOME=${JAVA_HOME:-unset}）。请安装 JDK 21 并设置 JAVA_HOME。" >&2
    exit 1
  fi
fi
export JAVA_HOME
echo "JAVA_HOME=$JAVA_HOME (java $(java_major "$JAVA_HOME"))"

# 2. 探测 Android SDK，写 local.properties（本地文件，不入库）
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [ -z "$SDK" ] && [ -d "$HOME/android-sdk/platforms/android-36" ]; then
  SDK="$HOME/android-sdk"
fi
if [ -z "$SDK" ]; then
  echo "未找到 Android SDK（需 Platform 36 + Build Tools 36）。请设置 ANDROID_HOME。" >&2
  exit 1
fi
# local.properties 由 Windows JVM 读取：必须是 C:/... 形式，不能用 Git Bash 的 /c/...
SDK_PROP=$(printf '%s' "$SDK" | sed 's|\\|/|g')
SDK_PROP=$(printf '%s' "$SDK_PROP" | sed -E 's|^/([a-zA-Z])/|\U\1:/|')
printf 'sdk.dir=%s\n' "$SDK_PROP" > apps/mobile/android/local.properties
echo "sdk.dir=$SDK_PROP"

# 3. build web → cap sync → gradlew assembleDebug
echo "==> 构建 Web 产物..."
pnpm --filter @atomic/web build
echo "==> 同步到 Android 壳..."
pnpm --filter @atomic/mobile cap:sync
echo "==> 编译 Debug APK..."
cd apps/mobile/android
./gradlew assembleDebug --no-daemon

APK="app/build/outputs/apk/debug/app-debug.apk"
cp "$APK" "$ROOT/artifacts/atomic-english-debug.apk"
echo ""
echo "完成：$ROOT/artifacts/atomic-english-debug.apk"
echo "安装到设备：adb install \"$ROOT/artifacts/atomic-english-debug.apk\""
