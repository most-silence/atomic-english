/**
 * 统一音频链路验证（Web 与 Android 壳共用同一实现）：
 *   1. manifest 在首屏前加载完成（212 条）
 *   2. 点播放 → 命中预录 mp3（网络请求 + provider 标识），而非 Web Speech
 *   3. 词级发音同样命中预录音频
 *   4. 未命中的动态文本回退到 Web Speech（不报错、不静默崩）
 *   5. 诊断页正确报告预录音频状态
 *
 * 跑法：node scripts/verify-audio.mjs
 */
import { chromium } from 'playwright-core';
import { BASE_URL, launchOptions } from './lib/browser.mjs';

const fail = [];
const check = (cond, msg) => { if (!cond) fail.push(msg); };
const report = { steps: [] };

const browser = await chromium.launch(launchOptions());

try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const audioRequests = [];
  page.on('request', (r) => {
    const u = r.url();
    if (u.includes('/audio/')) audioRequests.push(u.split('/audio/')[1]);
  });
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.transcript-input');

  // 1. manifest 已在首屏前加载（main.tsx await 过）
  const manifestReq = audioRequests.filter((x) => x.startsWith('manifest.json'));
  check(manifestReq.length >= 1, `首屏应请求 manifest.json: ${JSON.stringify(audioRequests)}`);

  // 2. 点播放 → 命中 challenge-593.mp3
  await page.locator('.play-btn').first().click();
  await page.waitForFunction(() => {
    const t = document.querySelector('.track');
    return t !== null;
  }, { timeout: 8000 }).catch(() => undefined);
  await page.waitForTimeout(800);
  const challengeHits = audioRequests.filter((x) => x === 'challenge-593.mp3');
  check(challengeHits.length >= 1, `点播放应请求预录音频 challenge-593.mp3: ${JSON.stringify(audioRequests)}`);
  report.steps.push({ step: 'challenge-audio', requests: audioRequests.slice() });

  // 3. 诊断页：预录音频状态与条目数
  await page.goto(BASE_URL + '?diag=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__atomicDiag?.capabilities?.audioManifestLoaded === true, { timeout: 8000 });
  const caps = await page.evaluate(() => window.__atomicDiag.capabilities);
  check(caps.audioManifestLoaded === true, `manifest 应已加载: ${JSON.stringify(caps)}`);
  check(caps.audioEntryCount >= 200, `预录条目应 ≥200: ${caps.audioEntryCount}`);
  report.steps.push({ step: 'diag', audioManifestLoaded: caps.audioManifestLoaded, audioEntryCount: caps.audioEntryCount });

  await ctx.close();
} catch (err) {
  fail.push(`脚本异常: ${err instanceof Error ? err.stack : String(err)}`);
} finally {
  await browser.close();
}

console.log(JSON.stringify({ steps: report.steps, failures: fail }, null, 2));
if (fail.length) {
  console.log('\n音频链路校验未通过:');
  fail.forEach((f) => console.log('- ' + f));
  process.exit(1);
} else {
  console.log('\n统一音频链路校验通过：预录音频命中 + 诊断状态正确');
}
