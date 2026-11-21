/**
 * 手机浏览器适配专项验证（Chrome Android 模拟，390×844）。
 * 测的是 CSS 可观测指标，不依赖 iOS 真机：
 *   - 核心按钮命中区 ≥44×44
 *   - 无横向溢出
 *   - 输入框字号 ≥16px（iOS 聚焦不缩放）
 *   - 100dvh / visualViewport 变量已注入
 *   - 底部导航 sticky 常驻
 *   - 触摸高亮与 overscroll 已处理
 *
 * 跑法：node scripts/verify-mobile.mjs（需 dev server 在 VERIFY_BASE_URL）
 */
import { chromium } from 'playwright-core';
import { BASE_URL as BASE, launchOptions } from './lib/browser.mjs';

const fail = [];
const check = (cond, msg) => { if (!cond) fail.push(msg); };
const report = { steps: [] };

const browser = await chromium.launch(launchOptions());

try {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'zh-CN',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.transcript-input');

  // 1. 视口与全局适配
  const globalCss = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return {
      textSizeAdjust: cs.getPropertyValue('-webkit-text-size-adjust'),
      tapHighlight: cs.getPropertyValue('-webkit-tap-highlight-color'),
      overscroll: cs.getPropertyValue('overscroll-behavior-y'),
      appHeightVar: cs.getPropertyValue('--app-height'),
      viewportFit: document.querySelector('meta[name=viewport]')?.content.includes('viewport-fit=cover'),
    };
  });
  check(globalCss.viewportFit, 'viewport 应含 viewport-fit=cover');
  check(globalCss.textSizeAdjust === '100%', `text-size-adjust 应为 100%: ${globalCss.textSizeAdjust}`);
  check(globalCss.overscroll === 'none', `overscroll-behavior-y 应为 none: ${globalCss.overscroll}`);
  check(!!globalCss.appHeightVar && globalCss.appHeightVar !== '', '--app-height 应由 useViewportHeight 注入');
  report.steps.push({ step: 'global', ...globalCss });

  // 2. 无横向溢出
  const overflow = await page.evaluate(() => ({
    docWidth: document.documentElement.scrollWidth,
    viewWidth: window.innerWidth,
  }));
  check(overflow.docWidth <= overflow.viewWidth + 1, `不应横向溢出: scrollWidth=${overflow.docWidth} > ${overflow.viewWidth}`);
  report.steps.push({ step: 'overflow', ...overflow });

  // 3. 核心按钮命中区（登录卡已移到复习 tab，先切过去测 cloudBtn）
  await page.locator('.tab').nth(2).click();
  await page.waitForSelector('[data-testid="cloud-status"]');
  const cloudBtnSize = await page.evaluate(() => {
    const el = document.querySelector('.cloud-btn');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  await page.locator('.tab').nth(0).click();
  await page.waitForSelector('.transcript-input');
  const hitTargets = await page.evaluate((cloudBtnSize) => {
    const pick = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    };
    return {
      play: pick('.play-btn'),
      tab: pick('.tab'),
      primary: pick('.primary-btn'),
      cloudBtn: cloudBtnSize,
    };
  }, cloudBtnSize);
  for (const [name, size] of Object.entries(hitTargets)) {
    check(size && size.w >= 44 && size.h >= 44, `${name} 命中区应 ≥44×44: ${JSON.stringify(size)}`);
  }
  report.steps.push({ step: 'hit-targets', ...hitTargets });

  // 4. 输入框字号 ≥16px
  const inputFont = await page.evaluate(() => {
    const el = document.querySelector('.transcript-input');
    return parseFloat(getComputedStyle(el).fontSize);
  });
  check(inputFont >= 16, `听写输入框字号应 ≥16px: ${inputFont}`);

  // 5. 底部导航 sticky
  const navPos = await page.evaluate(() => getComputedStyle(document.querySelector('.bottom-nav')).position);
  check(navPos === 'sticky', `底部导航应 sticky: ${navPos}`);

  // 6. 横屏（667×375）不强制滚动才能看到主操作
  await page.setViewportSize({ width: 667, height: 375 });
  await page.waitForTimeout(200);
  const landscape = await page.evaluate(() => ({
    docWidth: document.documentElement.scrollWidth,
    viewWidth: window.innerWidth,
    appMaxWidth: getComputedStyle(document.querySelector('.app')).maxWidth,
  }));
  check(landscape.docWidth <= landscape.viewWidth + 1, `横屏不应横向溢出: ${landscape.docWidth} > ${landscape.viewWidth}`);
  check(landscape.appMaxWidth === '100%' || parseFloat(landscape.appMaxWidth) >= 600, `横屏 app 应铺满: ${landscape.appMaxWidth}`);
  report.steps.push({ step: 'landscape', ...landscape });

  await ctx.close();
} catch (err) {
  fail.push(`脚本异常: ${err instanceof Error ? err.stack : String(err)}`);
} finally {
  await browser.close();
}

console.log(JSON.stringify({ steps: report.steps, failures: fail }, null, 2));
if (fail.length) {
  console.log('\n适配校验未通过:');
  fail.forEach((f) => console.log('- ' + f));
  process.exit(1);
} else {
  console.log('\n手机浏览器适配校验通过：命中区/溢出/字号/视口/横屏 全部满足');
}
