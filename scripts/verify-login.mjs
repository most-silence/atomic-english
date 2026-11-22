/**
 * 复习页内嵌登录卡验证：
 *   1. 最右「复习」tab 顶部常驻登录卡，邮箱/密码/注册按钮可见（无需点折叠）
 *   2. 其他 tab 不再显示分散的登录入口
 *   3. 后端不可达 / 空输入时点注册，必须有明确错误提示，不能静默无反应
 *
 * 跑法：VERIFY_BASE_URL=http://127.0.0.1:5175/ node scripts/verify-login.mjs
 */
import { chromium } from 'playwright-core';
import { BASE_URL as BASE, launchOptions } from './lib/browser.mjs';

const fail = [];
const check = (cond, msg) => { if (!cond) fail.push(msg); };
const report = { steps: [] };

const browser = await chromium.launch(launchOptions());

try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.transcript-input');

  // 1. 挑战页（最左）不应再有登录入口
  const onChallenge = await page.locator('[data-testid="cloud-status"]').count();
  check(onChallenge === 0, `挑战页不应显示登录卡: ${onChallenge}`);

  // 2. 切到最右「复习」tab，登录卡应常驻可见
  await page.locator('.tab').nth(2).click();
  await page.waitForSelector('[data-testid="cloud-status"]');
  const cardVisible = await page.locator('[data-testid="cloud-status"]').isVisible();
  check(cardVisible, '复习页应常驻显示登录卡');

  // 输入框与注册按钮直接可见（不是折叠状态）
  const emailVisible = await page.locator('input[type=email]').isVisible();
  const pwVisible = await page.locator('input[type=password]').isVisible();
  const regVisible = await page.getByRole('button', { name: '注册', exact: true }).isVisible();
  check(emailVisible && pwVisible, '邮箱/密码输入框应直接可见，无需点折叠');
  check(regVisible, '注册按钮应直接可见');
  report.steps.push({ step: 'card-visible', emailVisible, pwVisible, regVisible });

  // 3. 空输入点注册 -> 应有明确错误
  await page.getByRole('button', { name: '注册', exact: true }).click();
  const emptyErr = await page.locator('[data-testid="cloud-error"]').textContent().catch(() => null);
  check(!!emptyErr && emptyErr.includes('请输入'), `空输入点注册应有错误提示: ${emptyErr}`);
  report.steps.push({ step: 'empty-input-error', error: emptyErr });

  // 4. 点注册 -> 必须有明确反馈，不能静默。
  // 后端可达时应该真注册成功进入登录态；不可达时应该显示网络错误；
  // 需要邮箱确认时显示 info。三种都算"有反馈"，只有三者全无才是 bug。
  const uniqueEmail = `login-${Date.now()}@example.com`;
  await page.locator('input[type=email]').fill(uniqueEmail);
  await page.locator('input[type=password]').fill('Verify12345!');
  await page.getByRole('button', { name: '注册', exact: true }).click();
  await page.waitForTimeout(3000);
  const errText = await page.locator('[data-testid="cloud-error"]').textContent().catch(() => null);
  const infoText = await page.locator('[data-testid="cloud-info"]').textContent().catch(() => null);
  const signedIn = await page.locator('[data-testid="cloud-row"]').count();
  check(!!errText || !!infoText || signedIn > 0,
    `点注册后应有反馈（成功登录/错误/提示），不能静默: err=${errText} info=${infoText} signedIn=${signedIn}`);
  report.steps.push({ step: 'submit-feedback', error: errText, info: infoText, signedIn });

  // 5. 登录卡在词汇列表上方（DOM 顺序）
  const order = await page.evaluate(() => {
    const card = document.querySelector('[data-testid="cloud-status"]');
    const words = document.querySelector('.review-summary');
    return card && words ? (card.compareDocumentPosition(words) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 : false;
  });
  check(order, '登录卡应在词汇列表上方（同一界面）');
  report.steps.push({ step: 'order', cardAboveWords: order });

  await ctx.close();
} catch (err) {
  fail.push(`脚本异常: ${err instanceof Error ? err.stack : String(err)}`);
} finally {
  await browser.close();
}

console.log(JSON.stringify({ steps: report.steps, failures: fail }, null, 2));
if (fail.length) {
  console.log('\n登录界面校验未通过:');
  fail.forEach((f) => console.log('- ' + f));
  process.exit(1);
} else {
  console.log('\n登录界面校验通过：复习页常驻登录卡 + 反馈明确');
}
