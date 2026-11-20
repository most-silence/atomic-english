import { chromium } from 'playwright-core';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://127.0.0.1:5173/';
const errors = [];

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'zh-CN',
});
const page = await context.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('.brand-title');

const text = (sel) => page.locator(sel).first().textContent();
const report = {};

report.title = await text('.brand-title');
report.challengeMeta = await text('.challenge-meta');
report.metrics = await page.locator('.metric-value').allTextContents();
report.transcript = await page.locator('.transcript-input').inputValue();
report.translateHint = await text('.translate-hint');
report.tabs = await page.locator('.tab').allTextContents();
report.viewportWidth = await page.evaluate(() => window.innerWidth);
report.sentenceText = (await text('.sentence')).trim();
report.matchedCount = await page.locator('.sentence .hit').count();
report.missedCount = await page.locator('.sentence .miss').count();
report.translation = await page.locator('.translation').count()
  ? await text('.translation') : null;
await page.screenshot({ path: 'artifacts/challenge-initial.png', fullPage: true });

// 交互 1：下一题 → 重置为未提交态（正确率变 —）
await page.locator('.primary-btn').click();
await page.waitForSelector('.primary-btn');
report.afterNextAccuracy = (await page.locator('.metric-value').allTextContents())[2];
report.afterNextBtn = await text('.primary-btn');

// 交互 2：重新提交 → 判分再现 12.50%
await page.locator('.primary-btn').click();
await page.waitForSelector('.sentence .miss');
report.afterSubmitAccuracy = (await page.locator('.metric-value').allTextContents())[2];

// 交互 3：翻译按钮 → 免费次数减 1（首屏译文已显示，次数从 6 开始）
const before = await text('.translate-hint');
await page.locator('.translate-bar').click();
report.translateBefore = before;
report.translateAfter = await text('.translate-hint');

// 交互 4：复习 tab → 7 个字母序词条 + 13%
await page.locator('.tab').nth(2).click();
await page.waitForSelector('.word-pill');
report.words = await page.locator('.word-pill').allTextContents();
report.weekLabel = await text('.week-label');
report.weekStats = await page.locator('.stat').allTextContents();
await page.screenshot({ path: 'artifacts/review.png', fullPage: true });

// 交互 5：连续天数 tab
await page.locator('.tab').nth(1).click();
await page.waitForSelector('.streak-number');
report.streak = await text('.streak-number');
await page.screenshot({ path: 'artifacts/streak.png', fullPage: true });

report.consoleErrors = errors;
console.log(JSON.stringify(report, null, 2));

const fail = [];
if (report.viewportWidth !== 390) fail.push(`视口宽度异常: ${report.viewportWidth}（应为 390，检查是否被夹取）`);
if (report.title !== 'Atomic Learning') fail.push('标题不符');
if (!report.challengeMeta.includes('#593')) fail.push('挑战编号缺失');
if (report.metrics[2] !== '12.50%') fail.push(`首屏正确率不符: ${report.metrics[2]}`);
if (!report.sentenceText.startsWith('I have started')) fail.push(`原句大小写不符: ${report.sentenceText}`);
if (report.matchedCount !== 1 || report.missedCount !== 7) fail.push(`逐词高亮不符: hit=${report.matchedCount} miss=${report.missedCount}`);
if (report.translation !== '时隔多年，我又开始冲浪了。') fail.push('译文缺失');
if (report.afterNextAccuracy !== '—') fail.push(`下一题未重置: ${report.afterNextAccuracy}`);
if (report.afterSubmitAccuracy !== '12.50%') fail.push(`重新提交判分不符: ${report.afterSubmitAccuracy}`);
if (report.words.length !== 7) fail.push(`词条数不符: ${report.words.length}`);
if (report.words.join(',') !== 'after,again,have,off,started,surfing,years') fail.push(`词条顺序不符: ${report.words}`);
if (report.weekStats[0] !== '13%') fail.push(`周完成率不符: ${report.weekStats[0]}`);
if (errors.length) fail.push(`控制台错误: ${errors.join(' | ')}`);

await browser.close();
if (fail.length) {
  console.error('验证失败:\n- ' + fail.join('\n- '));
  process.exit(1);
}
console.log('全部验证通过');
