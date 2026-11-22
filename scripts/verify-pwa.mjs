/**
 * 阶段二 PWA + 音频 spike 的端到端验证。
 *
 * 跑法：node scripts/verify-pwa.mjs（需先 pnpm --filter @atomic/web build）
 * 关键：用生产构建产物 + 本地静态服务器，因为 SW 在 dev server 下默认不注册。
 *
 * 验证的是"机制是否接好"，而不是"iOS 真机行为"——后者无法在无头 Chrome 里证明，
 * 必须按 docs/research/pwa-audio-spike.md 的真机清单手工执行。
 */
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { launchOptions } from './lib/browser.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(HERE, '../apps/web/dist');
const PORT = 4173;
const BASE = `http://127.0.0.1:${PORT}`;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.wav': 'audio/wav',
};

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, BASE).pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (pathname === '/') pathname = '/index.html';
  const full = join(DIST, normalize(pathname));
  if (!full.startsWith(DIST)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = readFileSync(full);
    res.writeHead(200, {
      'Content-Type': MIME[extname(full)] || 'application/octet-stream',
      'Cache-Control': pathname.startsWith('/assets/')
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

await new Promise((done) => server.listen(PORT, '127.0.0.1', done));

const fail = [];
const consoleErrors = [];
const report = { steps: [] };
const check = (cond, msg) => {
  if (!cond) fail.push(msg);
};

let browser;
try {
  browser = await chromium.launch(launchOptions());
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'zh-CN',
  });
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('favicon')) consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  // ── 1. manifest 内容 ─────────────────────────────────────
  const manifestRes = await page.request.get(`${BASE}/manifest.webmanifest`);
  check(manifestRes.ok(), 'manifest 应返回 200');
  const manifest = await manifestRes.json();
  const iconSizes = manifest.icons.map((i) => i.sizes);
  const purposes = manifest.icons.map((i) => i.purpose);
  report.steps.push({
    step: 'manifest',
    name: manifest.name,
    start_url: manifest.start_url,
    display: manifest.display,
    iconSizes,
    purposes,
  });
  check(manifest.name === 'Atomic English', 'manifest.name 不符');
  check(manifest.start_url === '/?source=pwa', 'manifest.start_url 不符');
  check(manifest.display === 'standalone', 'manifest.display 应为 standalone');
  check(iconSizes.includes('192x192') && iconSizes.includes('512x512'), '需同时有 192/512 图标');
  check(purposes.includes('maskable'), '需有 maskable 图标');
  check(manifest.prefer_related_applications !== true, '不能声明 prefer_related_applications=true');

  // ── 2. 图标字节与尺寸 ────────────────────────────────────
  for (const [file, expected] of [
    ['/icons/icon-192.png', 192],
    ['/icons/icon-512.png', 512],
    ['/icons/icon-maskable-512.png', 512],
    ['/icons/apple-touch-icon.png', 180],
  ]) {
    const res = await page.request.get(`${BASE}${file}`);
    const buf = await res.body();
    const isPng = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    report.steps.push({ step: 'icon', file, width: w, height: h, bytes: buf.length });
    check(res.ok() && isPng, `${file} 应是有效 PNG`);
    check(w === expected && h === expected, `${file} 尺寸应为 ${expected}，实际 ${w}x${h}`);
  }

  // ── 3. SW 注册 + 应用壳缓存 ──────────────────────────────
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.transcript-input');
  await page.waitForFunction(() => window.__atomicPwa?.swRegistered === true, { timeout: 10000 });
  const swInfo = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    // 动态找当前 shell 缓存：SW 版本号会随 sw.js 改动提升，不硬编码
    const shellName = (await caches.keys()).find((k) => k.startsWith('atomic-shell-'));
    const keys = shellName ? await (await caches.open(shellName)).keys() : [];
    return {
      scope: reg?.scope,
      controller: !!navigator.serviceWorker.controller,
      shellName: shellName ?? null,
      shellKeys: keys.map((r) => new URL(r.url).pathname),
    };
  });
  report.steps.push({ step: 'service-worker', ...swInfo });
  check(swInfo.scope === `${BASE}/`, `SW scope 应为根路径，实际 ${swInfo.scope}`);
  check(swInfo.shellKeys.includes('/index.html'), '应用壳应缓存 index.html');
  check(swInfo.shellKeys.includes('/manifest.webmanifest'), '应用壳应缓存 manifest');

  // ── 4. 离线重载：应用壳仍可用 ────────────────────────────
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.transcript-input', { timeout: 10000 });
  const offlineBanner = await page.locator('[data-testid="pwa-offline"]').count();
  const offlineMeta = await page.locator('.challenge-meta').first().textContent();
  report.steps.push({ step: 'offline-reload', offlineBanner, meta: offlineMeta });
  check(offlineBanner === 1, '离线时应显示离线提示条');
  check(offlineMeta?.includes('#593'), '离线重载后应仍能进入挑战页');

  // ── 5. 恢复在线，诊断页能力探测 ──────────────────────────
  await context.setOffline(false);
  await page.goto(`${BASE}/?diag=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="diag-unlock"]');
  await page.waitForFunction(() => window.__atomicDiag?.capabilities !== null);
  const caps = await page.evaluate(() => window.__atomicDiag.capabilities);
  report.steps.push({
    step: 'capabilities',
    platform: caps.platform,
    hasSpeechSynthesis: caps.hasSpeechSynthesis,
    voiceCount: caps.voiceCount,
    hasCacheApi: caps.hasCacheApi,
    notes: caps.notes,
  });
  check(caps.hasSpeechSynthesis === true, 'Chrome 应支持语音合成');
  check(caps.hasCacheApi === true, 'Chrome 应支持 Cache API');
  check(Array.isArray(caps.notes) && caps.notes.length > 0, '应列出已知平台限制');

  // ── 6. 解锁音频会话 ──────────────────────────────────────
  await page.locator('[data-testid="diag-unlock"]').click();
  await page.waitForFunction(() => window.__atomicDiag?.unlockResult !== '未执行');
  const unlock = await page.evaluate(() => window.__atomicDiag.unlockResult);
  report.steps.push({ step: 'unlock', result: unlock });
  check(unlock.includes('keepAlive=true'), `保活音轨应启动成功: ${unlock}`);

  // ── 7. Cache API 往返 ────────────────────────────────────
  await page.locator('[data-testid="diag-cache"]').click();
  await page.waitForFunction(() => window.__atomicDiag?.audioCacheEntries > 0);
  const cacheState = await page.evaluate(() => ({
    entries: window.__atomicDiag.audioCacheEntries,
    lastLog: window.__atomicDiag.logs.at(-1),
  }));
  report.steps.push({ step: 'audio-cache', ...cacheState });
  check(cacheState.entries >= 1, '音频缓存应有条目');
  check(cacheState.lastLog.includes('缓存命中'), `缓存往返应命中: ${cacheState.lastLog}`);

  // ── 8. 发音 + 看门狗兜底 ─────────────────────────────────
  await page.locator('[data-testid="diag-speak"]').click();
  await page.waitForFunction(() => window.__atomicDiag?.lastPlayback !== null, { timeout: 15000 });
  const playback = await page.evaluate(() => window.__atomicDiag.lastPlayback);
  report.steps.push({ step: 'speak', ...playback });
  check(['ended', 'watchdog', 'error'].includes(playback.outcome), `结束原因异常: ${playback.outcome}`);
  check(playback.elapsedMs > 0, '发音耗时应大于 0');

  // ── 9. 埋点队列 ──────────────────────────────────────────
  await page.locator('[data-testid="diag-analytics"]').click();
  await page.waitForFunction(() =>
    window.__atomicDiag?.analytics?.events.some((e) => e.name === 'diag_selftest'),
  );
  const analytics = await page.evaluate(() => window.__atomicDiag.analytics);
  report.steps.push({
    step: 'analytics',
    total: analytics.total,
    names: analytics.events.map((e) => e.name),
  });
  check(
    analytics.events.some((e) => e.name === 'diag_selftest'),
    '埋点自检事件应写入本地队列',
  );
  check(
    analytics.events.some((e) => e.name === 'audio_unlock'),
    '音频解锁事件应被记录',
  );

  // ── 10. 正常流程未被 PWA 改动破坏 ────────────────────────
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.transcript-input');
  const meta = await page.locator('.challenge-meta').first().textContent();
  report.steps.push({ step: 'regression', meta });
  check(meta?.includes('#593'), 'PWA 接入后挑战页仍应正常');

  report.consoleErrors = consoleErrors;
  check(consoleErrors.length === 0, `控制台错误: ${consoleErrors.join(' | ')}`);
} finally {
  await browser?.close();
  server.close();
}

console.log(JSON.stringify(report, null, 2));
if (fail.length) {
  console.error('\n验证失败:\n- ' + fail.join('\n- '));
  process.exit(1);
}
console.log('\nPWA + 音频 spike 验证通过：10 个环节全绿');
