/**
 * 持久化专项验证：
 *   测试 1「临时使用当天的缓存都有用」：未登录答题/翻译 → 刷新 → 本地数据恢复；
 *     再模拟跨天（直接改 IndexedDB 的 currentDate 为昨天）→ 刷新 → 当日项重置、累计项保留。
 *   测试 2「邮箱注册后持久化存储」：注册答题同步 → 全新 context 清空本地库 → 登录同账号 → 云端拉回。
 *
 * 前置：dev server（apps/web）+ 本地 Supabase 栈都在跑。
 * 跑法：node scripts/verify-persistence.mjs
 */
import { chromium } from 'playwright-core';
import { BASE_URL as BASE, launchOptions } from './lib/browser.mjs';

const fail = [];
const consoleErrors = [];
const check = (cond, msg) => { if (!cond) fail.push(msg); };
const report = { steps: [] };
const stamp = Date.now();
const email = `persist-${stamp}@example.com`;
const pw = 'Verify12345!';

const browser = await chromium.launch(launchOptions());

function watch(page) {
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
}

async function signUp(page) {
  // 登录卡已移到最右「复习」tab，与词汇同屏
  await page.locator('.tab').nth(2).click();
  await page.waitForSelector('[data-testid="cloud-status"]');
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(pw);
  await page.getByRole('button', { name: '注册', exact: true }).click();
  await page.waitForSelector('.cloud-email', { timeout: 15000 });
}

try {
  // ════════ 测试 1：临时使用（未登录）的当天缓存 ════════
  const ctx1 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p1 = await ctx1.newPage();
  watch(p1);
  await p1.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p1.waitForSelector('.transcript-input');

  // 确认未登录：复习页应显示注册按钮
  await p1.locator('.tab').nth(2).click();
  await p1.waitForSelector('[data-testid="cloud-status"]');
  check(await p1.getByRole('button', { name: '注册', exact: true }).count() === 1, 'T1 应为未登录临时态');
  await p1.locator('.tab').nth(0).click();
  await p1.waitForSelector('.transcript-input');

  // 答题：提交第一题
  await p1.locator('.transcript-input').fill('I start');
  await p1.locator('.primary-btn').first().click();
  await p1.waitForSelector('.sentence .miss');
  // 翻译：扣一次额度
  const hintBefore = await p1.locator('.translate-hint').first().textContent();
  for (let i = 0; i < 3; i++) {
    await p1.locator('.translate-bar').click();
    await p1.waitForTimeout(1500);
    if (await p1.locator('.translation').count()) break;
  }
  const hintAfter = await p1.locator('.translate-hint').first().textContent();
  check(hintBefore?.includes('6') && hintAfter?.includes('5'), `T1 翻译额度应扣 1: ${hintBefore} → ${hintAfter}`);

  // 切到下一题，制造"进度已推进"
  await p1.locator('.primary-btn').first().click();
  await p1.waitForSelector('.transcript-input');
  await p1.locator('.transcript-input').fill('she read');
  await p1.locator('.primary-btn').first().click();
  await p1.waitForSelector('.sentence .miss');

  // 复习 tab 应有错词
  await p1.locator('.tab').nth(2).click();
  await p1.waitForSelector('[data-testid="word-pill"]');
  const wordsBefore = await p1.locator('[data-testid="word-pill"]').allTextContents();
  check(wordsBefore.length > 0, `T1 应有错词入库: ${wordsBefore}`);

  // ── 刷新：验证本地恢复 ──
  await p1.reload({ waitUntil: 'domcontentloaded' });
  await p1.waitForSelector('.transcript-input');
  const metaAfterReload = await p1.locator('.challenge-meta').first().textContent();
  check(metaAfterReload?.includes('#595'), `T1 刷新后进度应恢复(提交两题后停在#595): ${metaAfterReload}`);
  // 回到提交态看翻译额度（刷新后在第3题未提交态，额度应仍是 5）
  const hintAfterReload = await p1.locator('.translate-hint').first().textContent();
  check(hintAfterReload?.includes('5'), `T1 刷新后翻译额度应保持 5: ${hintAfterReload}`);
  await p1.locator('.tab').nth(2).click();
  await p1.waitForSelector('[data-testid="word-pill"]');
  const wordsAfterReload = await p1.locator('[data-testid="word-pill"]').allTextContents();
  check(wordsAfterReload.join(',') === wordsBefore.join(','), `T1 刷新后错词应保留: ${wordsAfterReload}`);
  report.steps.push({
    step: 'T1-reload',
    meta: metaAfterReload,
    hint: hintAfterReload,
    words: wordsAfterReload,
  });

  // ── 模拟跨天：把 progress.currentDate 改成昨天，刷新 ──
  await p1.evaluate(() => {
    const req = indexedDB.open('atomic-english');
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('progress', 'readwrite');
      const store = tx.objectStore('progress');
      const get = store.get('main');
      get.onsuccess = () => {
        const row = get.result;
        row.currentDate = '2026-11-20';
        row.todayPlayCount = 7;
        row.freeTranslationsLeft = 1;
        store.put(row);
      };
    };
  });
  await p1.waitForTimeout(300);
  await p1.reload({ waitUntil: 'domcontentloaded' });
  await p1.waitForSelector('.transcript-input');
  const hintNextDay = await p1.locator('.translate-hint').first().textContent();
  check(hintNextDay?.includes('6'), `T1 跨天后翻译额度应重置为 6: ${hintNextDay}`);
  const metaNextDay = await p1.locator('.challenge-meta').first().textContent();
  check(metaNextDay?.includes('#595'), `T1 跨天后累计进度(#595)应保留: ${metaNextDay}`);
  await p1.locator('.tab').nth(2).click();
  await p1.waitForSelector('[data-testid="word-pill"]');
  const wordsNextDay = await p1.locator('[data-testid="word-pill"]').allTextContents();
  check(wordsNextDay.join(',') === wordsBefore.join(','), `T1 跨天后错词(累计项)应保留: ${wordsNextDay}`);
  report.steps.push({ step: 'T1-next-day', hint: hintNextDay, meta: metaNextDay, words: wordsNextDay });
  await ctx1.close();

  // ════════ 测试 2：邮箱注册后的持久化 ════════
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p2 = await ctx2.newPage();
  watch(p2);
  await p2.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p2.waitForSelector('.transcript-input');
  await signUp(p2);
  await p2.locator('.tab').nth(0).click();
  await p2.waitForSelector('.transcript-input');
  // 答两题
  for (const input of ['I start', 'she read']) {
    await p2.locator('.transcript-input').fill(input);
    await p2.locator('.primary-btn').first().click();
    await p2.waitForSelector('.sentence .miss');
    await p2.locator('.primary-btn').first().click();
    await p2.waitForSelector('.transcript-input');
  }
  // 等到同步完成
  await p2.waitForFunction(() => {
    const row = document.querySelector('[data-testid="cloud-row"]');
    const meta = document.querySelector('.challenge-meta');
    return row?.getAttribute('data-last-sync') && meta?.textContent?.includes('#595');
  }, { timeout: 25000 });
  // 答题后 markDirty 延迟 2 秒才 push，必须等这次 push 完成（覆盖 2s 定时器+网络）
  // 否则关掉 context 会中断 push，云端还是注册时的空快照
  await p2.waitForTimeout(3500);
  const metaSynced = await p2.locator('.challenge-meta').first().textContent();
  check(metaSynced?.includes('#595'), `T2 同步前进度应为 #595: ${metaSynced}`);
  report.steps.push({ step: 'T2-synced', meta: metaSynced, email });
  await ctx2.close();

  // ── 全新 context（模拟另一台设备），清空本地库后登录同账号 ──
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p3 = await ctx3.newPage();
  watch(p3);
  await p3.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p3.waitForSelector('.transcript-input');
  // 确认是干净状态（#593）
  const metaClean = await p3.locator('.challenge-meta').first().textContent();
  check(metaClean?.includes('#593'), `T2 新设备应初始为 #593: ${metaClean}`);
  // 登录（登录卡在复习 tab）
  await p3.locator('.tab').nth(2).click();
  await p3.waitForSelector('[data-testid="cloud-status"]');
  await p3.locator('input[type=email]').fill(email);
  await p3.locator('input[type=password]').fill(pw);
  await p3.getByRole('button', { name: '登录', exact: true }).click();
  await p3.waitForSelector('.cloud-email', { timeout: 15000 });
  // 等 pull 完成
  try {
    await p3.waitForFunction(() => {
      const row = document.querySelector('[data-testid="cloud-row"]');
      const meta = document.querySelector('.challenge-meta');
      return row?.getAttribute('data-last-sync') && meta?.textContent?.includes('#595') && !meta.textContent?.includes('连续天数 0');
    }, { timeout: 25000 });
  } catch (e) {
    // 诊断：失败时把关键状态打出来，区分是"没 pull"还是"pull 了但 UI 没刷新"
    const diag = await p3.evaluate(() => new Promise((r) => {
      const row = document.querySelector('[data-testid="cloud-row"]');
      const q = indexedDB.open('atomic-english');
      q.onsuccess = () => {
        const g = q.result.transaction('progress').objectStore('progress').get('main');
        g.onsuccess = () => r({
          meta: document.querySelector('.challenge-meta')?.textContent,
          cloudState: row?.getAttribute('data-sync-state'),
          lastSync: row?.getAttribute('data-last-sync'),
          dbProgress: g.result,
        });
      };
    }));
    console.log('B-DIAG', JSON.stringify(diag));
    throw e;
  }
  const metaPulled = await p3.locator('.challenge-meta').first().textContent();
  check(metaPulled?.includes('#595'), `T2 登录后应拉回云端进度 #595: ${metaPulled}`);
  check(metaPulled?.includes('连续天数 1'), `T2 连续天数应与云端一致(1): ${metaPulled}`);
  await p3.locator('.tab').nth(2).click();
  await p3.waitForSelector('.review-summary');
  const reviewPulled = await p3.locator('.review-summary').first().textContent();
  check(reviewPulled?.includes('待复习') && !reviewPulled?.includes('待复习 0'), `T2 登录后错词应拉回: ${reviewPulled}`);
  report.steps.push({ step: 'T2-pulled', meta: metaPulled, review: reviewPulled });
  await ctx3.close();

} catch (err) {
  fail.push(`脚本异常: ${err instanceof Error ? err.stack : String(err)}`);
} finally {
  await browser.close();
}

console.log(JSON.stringify({ steps: report.steps, failures: fail, consoleErrors }, null, 2));
if (fail.length || consoleErrors.length) {
  console.log('\n校验未通过:');
  [...fail, ...consoleErrors].forEach((f) => console.log('- ' + f));
  process.exit(1);
} else {
  console.log('\n持久化校验通过：临时当天缓存 + 注册后持久化 全部满足');
}
