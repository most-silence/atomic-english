import { chromium } from 'playwright-core';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://127.0.0.1:5173/';
const errors = [];
const fail = [];
const check = (cond, msg) => { if (!cond) fail.push(msg); };

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'zh-CN',
});
// 用同一个 page 贯穿全流程，模拟一个真实用户会话
const page = await context.newPage();
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

const text = (sel) => page.locator(sel).first().textContent();
const report = { steps: [] };

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('.transcript-input');

// ── 步骤 1：全新用户，干净未作答态 ──────────────────────
const firstMeta = await text('.challenge-meta');
const firstAccuracy = (await page.locator('.metric-value').allTextContents())[2];
const firstInput = await page.locator('.transcript-input').inputValue();
report.steps.push({ step: 'fresh', meta: firstMeta, accuracy: firstAccuracy, input: firstInput });
check(firstMeta.includes('#593'), `首题应为 #593: ${firstMeta}`);
check(firstAccuracy === '—', `未作答时正确率应为空: ${firstAccuracy}`);
check(firstInput === '', `未作答时输入应为空: ${firstInput}`);

// ── 步骤 2：听写第一题 → 提交 → 判分 12.50% ────────────
await page.locator('.transcript-input').fill('I start');
await page.locator('.primary-btn').click();
await page.waitForSelector('.sentence .miss');
const acc1 = (await page.locator('.metric-value').allTextContents())[2];
const hit1 = await page.locator('.sentence .hit').count();
const miss1 = await page.locator('.sentence .miss').count();
report.steps.push({ step: 'submit#593', accuracy: acc1, hit: hit1, miss: miss1 });
check(acc1 === '12.50%', `第一题判分应为 12.50%: ${acc1}`);
check(hit1 === 1 && miss1 === 7, `逐词高亮应 1 中 7 错: ${hit1}/${miss1}`);

// ── 步骤 3：翻译扣额度 ────────────────────────────────
const beforeTranslate = await text('.translate-hint');
await page.locator('.translate-bar').click();
await page.waitForSelector('.translation');
const afterTranslate = await text('.translate-hint');
const translation = await text('.translation');
report.steps.push({ step: 'translate', before: beforeTranslate, after: afterTranslate, translation });
check(beforeTranslate === '还剩 6 次免费翻译', `初始翻译额度: ${beforeTranslate}`);
check(afterTranslate === '还剩 5 次免费翻译', `翻译后额度应减 1: ${afterTranslate}`);
// 真实翻译 API 的措辞不固定，验证「返回了中文译文」而非写死字符串
check(Boolean(translation && /[\u4e00-\u9fa5]/.test(translation)), `译文应为中文: ${translation}`);
check(translation !== '时隔多年，我又开始冲浪了。', '译文应来自真实 API 而非 seed 写死文案');

// ── 步骤 4：下一题 → 自动进入 #594 未作答态 ──────────────
await page.locator('.primary-btn').click();
await page.waitForSelector('.transcript-input');
const secondMeta = await text('.challenge-meta');
const secondAccuracy = (await page.locator('.metric-value').allTextContents())[2];
report.steps.push({ step: 'next', meta: secondMeta, accuracy: secondAccuracy });
check(secondMeta.includes('#594'), `下一题应为 #594: ${secondMeta}`);
check(secondAccuracy === '—', `新题应未作答: ${secondAccuracy}`);

// ── 步骤 5：复习 tab → 7 个词条来自第一题 ────────────────
await page.locator('.tab').nth(2).click();
await page.waitForSelector('.word-pill');
const words = await page.locator('.word-pill').allTextContents();
const reviewSummary = await text('.review-summary');
report.steps.push({ step: 'review', words, summary: reviewSummary });
check(words.join(',') === 'after,again,have,off,started,surfing,years', `词条不符: ${words}`);
check(reviewSummary.includes('共 7'), `复习总数应为 7: ${reviewSummary}`);

// ── 步骤 6：词级听写复习 → 单条判分并推进 SRS ────────────
// 第一题只命中虚词 I，7 个实词全错，第一个词是 after
await page.locator('[data-testid="word-pill"]').first().click();
await page.waitForSelector('[data-testid="review-drill"]');
// 故意拼错
await page.locator('[data-testid="review-input"]').fill('aftr');
await page.locator('[data-testid="review-submit"]').click();
await page.waitForSelector('[data-testid="review-feedback"]');
const feedback = await text('.review-wrong');
check(feedback.includes('after'), `错误反馈应给出正确答案 after: ${feedback}`);
await page.locator('[data-testid="review-next"]').click();
await page.waitForTimeout(150);
const afterPracticeSummary = await text('.review-summary');
const pillsAfter = await page.locator('[data-testid="word-pill"]').count();
report.steps.push({ step: 'practice', feedback, summary: afterPracticeSummary, pills: pillsAfter });
check(afterPracticeSummary.includes('待复习 6'), `复习一个词后应剩 6: ${afterPracticeSummary}`);
check(pillsAfter === 6, `到期词条应剩 6: ${pillsAfter}`);

// ── 步骤 7：刷新页面 → 状态从 IndexedDB 恢复 ─────────────
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.transcript-input');
const restoredMeta = await text('.challenge-meta');
await page.locator('.tab').nth(2).click();
await page.waitForSelector('.review-summary');
const restoredSummary = await text('.review-summary');
report.steps.push({ step: 'reload', meta: restoredMeta, summary: restoredSummary });
check(restoredMeta.includes('#594'), `刷新后应停在 #594: ${restoredMeta}`);
check(restoredSummary.includes('共 7'), `刷新后词条应保留: ${restoredSummary}`);

// ── 步骤 8：连续做完后 3 题 → 通关态 ─────────────────────
await page.locator('.tab').nth(0).click();
for (const n of [594, 595, 596, 597, 598, 599]) {
  await page.waitForSelector('.transcript-input');
  const meta = await text('.challenge-meta');
  check(meta.includes(`#${n}`), `应做到 #${n}: ${meta}`);
  await page.locator('.transcript-input').fill('some wrong words');
  await page.locator('.primary-btn').click();
  await page.waitForSelector('.sentence .miss');
  await page.locator('.primary-btn').click();
}
// 题库已扩充到 30 道，做完前 7 道后应自然进入 #600，而不是通关
await page.waitForSelector('.transcript-input');
const nextMeta = await text('.challenge-meta');
report.steps.push({ step: 'complete', meta: nextMeta });
check(nextMeta.includes('#600'), `做完后应进入 #600: ${nextMeta}`);

// ── 步骤 9：重置 → 回到第一题 ───────────────────────────
// 用诊断入口无法重置（只在通关态有按钮），这里直接清 IndexedDB 后刷新
await page.evaluate(() => new Promise((resolve) => {
  const req = indexedDB.deleteDatabase('atomic-english');
  req.onsuccess = () => resolve();
  req.onerror = () => resolve();
}));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.transcript-input');
const resetMeta = await text('.challenge-meta');
report.steps.push({ step: 'reset', meta: resetMeta });
check(resetMeta.includes('#593'), `重置后应回到 #593: ${resetMeta}`);

report.consoleErrors = errors;
console.log(JSON.stringify(report, null, 2));
check(errors.length === 0, `控制台错误: ${errors.join(' | ')}`);

await browser.close();
if (fail.length) {
  console.error('\n验证失败:\n- ' + fail.join('\n- '));
  process.exit(1);
}
console.log('\n全流程验证通过：9 个环节全绿');
