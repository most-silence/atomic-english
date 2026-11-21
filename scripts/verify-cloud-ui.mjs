/**
 * 浏览器端前后端集成验证：
 *   用户 A 注册 → 答题 → 自动同步 → 用户 B 登录（同账号）→ 拉回 A 的进度
 *
 * 前置：dev server（apps/web，带 .env.local）+ 本地 Supabase 栈都在跑。
 * 跑法：node scripts/verify-cloud-ui.mjs
 */
import { chromium } from 'playwright-core';

const BASE = 'http://127.0.0.1:5173/';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const stamp = Date.now();
const email = `ui-${stamp}@example.com`;
const pw = 'Verify12345!';

const fail = [];
const consoleErrors = [];
const check = (cond, msg) => { if (!cond) fail.push(msg); };
const report = { steps: [] };

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

try {
  // 用同一个 browser、两个独立 context 模拟"两台设备"
  const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const pageA = await ctxA.newPage();
  pageA.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) consoleErrors.push(m.text()); });
  pageA.on('pageerror', (e) => consoleErrors.push(String(e)));

  await pageA.goto(BASE, { waitUntil: 'domcontentloaded' });
  await pageA.waitForSelector('[data-testid="cloud-status"]');
  const cloudVisible = await pageA.locator('[data-testid="cloud-status"]').count();
  check(cloudVisible === 1, '配置了 Supabase 后应显示云同步入口');
  report.steps.push({ step: 'cloud-ui-visible', visible: cloudVisible });

  // ── 1. A 注册 ────────────────────────────────────────────
  await pageA.locator('.cloud-btn').first().click();
  await pageA.locator('.cloud-input[type="email"]').fill(email);
  await pageA.locator('.cloud-input[type="password"]').fill(pw);
  await pageA.getByRole('button', { name: '注册' }).click();
  await pageA.waitForSelector('.cloud-email', { timeout: 10000 });
  const signedIn = await pageA.locator('.cloud-email').textContent();
  check(signedIn?.includes('ui-'), `注册后应显示登录邮箱: ${signedIn}`);
  report.steps.push({ step: 'signup', email: signedIn });

  // ── 2. A 答题（等自动同步）─────────────────────────────────
  await pageA.waitForSelector('.transcript-input');
  await pageA.locator('.transcript-input').fill('I start');
  await pageA.locator('.primary-btn').first().click();
  await pageA.waitForSelector('.sentence .miss');
  // 记录答题前的 lastSyncAt，答题后必须等它变化（2 秒延迟 push 完成）
  const lastSyncBefore = await pageA.locator('[data-testid=cloud-row]').getAttribute('data-last-sync');
  await pageA.waitForFunction((prev) => {
    const el = document.querySelector('[data-testid=cloud-row]');
    const now = el?.getAttribute('data-last-sync');
    return Boolean(now && now !== prev);
  }, lastSyncBefore, { timeout: 20000 });
  const syncState = await pageA.locator('.cloud-state').textContent();
  const lastSyncAfter = await pageA.locator('[data-testid=cloud-row]').getAttribute('data-last-sync');
  check(syncState === '已同步', `答题后应自动同步: ${syncState}`);
  check(Boolean(lastSyncAfter && lastSyncAfter !== lastSyncBefore), '答题后 lastSyncAt 应更新');
  report.steps.push({ step: 'auto-sync', state: syncState, before: lastSyncBefore, after: lastSyncAfter });

  // ── 3. B 用同账号登录，拉回 A 的进度 ───────────────────────
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const pageB = await ctxB.newPage();
  pageB.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) consoleErrors.push(m.text()); });
  pageB.on('pageerror', (e) => consoleErrors.push(String(e)));

  await pageB.goto(BASE, { waitUntil: 'domcontentloaded' });
  await pageB.waitForSelector('[data-testid="cloud-status"]');
  await pageB.locator('.cloud-btn').first().click();
  await pageB.locator('.cloud-input[type="email"]').fill(email);
  await pageB.locator('.cloud-input[type="password"]').fill(pw);
  await pageB.getByRole('button', { name: '登录', exact: true }).click();
  await pageB.waitForSelector('.cloud-email', { timeout: 10000 });
  // 等 B 的首次同步（登录触发的全量 pull + lastSyncAt 更新）完成
  await pageB.waitForFunction(() => {
    const el = document.querySelector('[data-testid=cloud-row]');
    return Boolean(el?.getAttribute('data-last-sync'));
  }, { timeout: 20000 });

  // 登录后 orchestrator 全量 pull，进度应从云端合回来：
  // A 做完 #593，B 应停在 #594，复习页应有 7 个词
  await pageB.waitForSelector('.transcript-input');
  await pageB.waitForFunction(() => {
    const meta = document.querySelector('.challenge-meta');
    return meta && meta.textContent?.includes('#594');
  }, { timeout: 15000 });
  const metaB = await pageB.locator('.challenge-meta').first().textContent();
  check(metaB?.includes('#594'), `B 应拉回 A 的进度、停在 #594: ${metaB}`);

  await pageB.locator('.tab').nth(2).click();
  await pageB.waitForSelector('.review-summary');
  const summaryB = await pageB.locator('.review-summary').textContent();
  check(summaryB?.includes('共 7'), `B 应拉回 A 的复习词条: ${summaryB}`);
  report.steps.push({ step: 'cross-device', meta: metaB, review: summaryB });

  report.consoleErrors = consoleErrors;
  check(consoleErrors.length === 0, `控制台错误: ${consoleErrors.join(' | ')}`);
} finally {
  await browser.close();
}

console.log(JSON.stringify(report, null, 2));
if (fail.length) {
  console.error('\n验证失败:\n- ' + fail.join('\n- '));
  process.exit(1);
}
console.log('\n浏览器端前后端验证通过：注册 / 答题 / 自动同步 / 跨设备读回');
