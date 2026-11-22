/**
 * 通过 CDP 验证「真机 APK 内的 WebView」点播放后走的是预录音频，而非 Web Speech。
 *
 * 前置：
 *   1. 手机 USB 连接并授权调试（adb devices 能看到 device）
 *   2. APK 已安装并启动（bash scripts/android-debug.sh <设备> all）
 *   3. WebView 调试端口已转发（脚本的 cdp/verify-audio 子命令会做）
 *
 * 原理：Capacitor 的 WebView 在 debuggable 构建下暴露 CDP。连进去读 performance
 * resource 记录，确认点播放后请求了 /audio/challenge-*.mp3；若只走 Web Speech 则不会有该请求。
 */
const CDP = process.env.CDP_URL || 'http://127.0.0.1:9222';

const list = await (await fetch(`${CDP}/json/list`)).json();
const page = list.find((x) => x.type === 'page' && x.url.includes('localhost'));
if (!page) {
  console.error('未找到应用的 WebView 页面，确认 APK 已启动');
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
};
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });

const send = (method, params = {}) =>
  new Promise((resolve) => {
    const n = ++id;
    pending.set(n, resolve);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value ?? null;
};

const fail = [];
const check = (cond, msg) => { if (!cond) fail.push(msg); };

const url = await ev('location.href');
const meta = await ev('document.querySelector(".challenge-meta")?.textContent');
const manifestCount = await ev('performance.getEntriesByType("resource").filter(e=>e.name.includes("/audio/manifest.json")).length');
check(manifestCount >= 1, `manifest 应已加载: ${manifestCount}`);

// 点播放，触发预录音频请求
await ev('document.querySelector(".play-btn")?.click()');
await new Promise((r) => setTimeout(r, 1500));
const audioReqs = await ev('performance.getEntriesByType("resource").filter(e=>e.name.includes("/audio/challenge-")).map(e=>e.name.split("/").pop())');
check(Array.isArray(audioReqs) && audioReqs.length >= 1,
  `点播放后应请求预录 mp3，实际: ${JSON.stringify(audioReqs)}`);

const caches = await ev('caches.keys()');
check(Array.isArray(caches) && caches.some((c) => c.includes('atomic-audio')),
  `应有音频缓存: ${JSON.stringify(caches)}`);

const playing = await ev('document.querySelector(".play-btn")?.className');
check(typeof playing === 'string' && playing.includes('playing'), `按钮应进入播放态: ${playing}`);

console.log(JSON.stringify({ url, meta, manifestCount, audioReqs, caches, playing, failures: fail }, null, 2));
ws.close();

if (fail.length) {
  console.error('\n真机音频校验未通过:\n- ' + fail.join('\n- '));
  process.exit(1);
}
console.log('\n真机音频校验通过：APK 内 WebView 点播放走的是预录 mp3');
