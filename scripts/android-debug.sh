#!/usr/bin/env bash
# 在电脑上调试已通过 USB 连接的 Android 真机上的 Atomic English。
# 前置：手机开启 USB 调试并用 USB 连到电脑；adb 在 PATH 或 ANDROID_HOME/platform-tools 下。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ADB="${ADB:-$HOME/android-sdk/platform-tools/adb.exe}"
[ -x "$ADB" ] || ADB="adb"
APK="$ROOT/artifacts/atomic-english-debug.apk"

DEV="${1:-}"
if [ -z "$DEV" ]; then
  DEV=$("$ADB" devices 2>/dev/null | awk '$2=="device"{print $1; exit}')
fi
[ -n "$DEV" ] || { echo "没有已授权的设备。检查 USB 调试与 adb devices。" >&2; exit 1; }
echo "设备: $DEV"

# 从 WebView 调试 socket 名提取 PID（比 ps 解析更可靠，不受 CRLF/进程名列位置影响）
webview_pid() {
  "$ADB" -s "$DEV" shell cat /proc/net/unix 2>/dev/null \
    | tr -d '\r' \
    | sed -n 's/.*@webview_devtools_remote_\([0-9][0-9]*\).*/\1/p' \
    | head -1
}

forward_cdp() {
  "$ADB" -s "$DEV" forward --remove tcp:9222 >/dev/null 2>&1 || true
  local pid
  pid=$(webview_pid)
  [ -n "$pid" ] || { echo "应用未运行或 WebView 调试不可用" >&2; return 1; }
  "$ADB" -s "$DEV" forward tcp:9222 "localabstract:webview_devtools_remote_$pid" >/dev/null
  echo "$pid"
}

case "${2:-all}" in
  install)
    [ -f "$APK" ] || { echo "APK 不存在，先 pnpm android:build" >&2; exit 1; }
    "$ADB" -s "$DEV" install -r "$APK"
    ;;
  start)
    "$ADB" -s "$DEV" monkey -p com.atomic.english -c android.intent.category.LAUNCHER 1
    ;;
  shot)
    OUT="${3:-$ROOT/.workbuddy/phone-screen.png}"
    "$ADB" -s "$DEV" exec-out screencap -p > "$OUT"
    echo "截图: $OUT"
    ;;
  log)
    echo "实时日志（Ctrl-C 退出），可另开终端过滤：adb logcat | grep -i atomic"
    "$ADB" -s "$DEV" logcat
    ;;
  cdp)
    # 把 WebView 调试端口转发到本地，之后浏览器打开 chrome://inspect 或用 CDP 脚本
    PID=$(forward_cdp) || exit 1
    echo "WebView 调试已转发到 http://127.0.0.1:9222 （PID $PID）"
    echo "浏览器打开 chrome://inspect → Devices → 找到 Atomic English → inspect"
    ;;
  verify-audio)
    # 端到端：确认 APK 内 WebView 点播放后真的请求了预录 mp3
    forward_cdp >/dev/null || exit 1
    node "$ROOT/scripts/verify-device-audio.mjs"
    ;;
  all)
    [ -f "$APK" ] && "$ADB" -s "$DEV" install -r "$APK"
    "$ADB" -s "$DEV" monkey -p com.atomic.english -c android.intent.category.LAUNCHER 1 >/dev/null
    echo "已安装并启动。用 ./scripts/android-debug.sh $DEV shot 截屏，或 cdp 连 WebView 调试。"
    ;;
  *)
    echo "用法: $0 [设备号] [install|start|shot|log|cdp|verify-audio|all]" >&2
    exit 1
    ;;
esac
