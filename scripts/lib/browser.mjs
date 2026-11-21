import { existsSync } from 'node:fs';

/**
 * 验证脚本共享的浏览器与地址配置。
 * 消除三个脚本里重复的 Windows 绝对路径——那会让 CI / Linux / macOS 一律跑不了。
 */

/** 常见 Chrome 安装路径，按平台探测；可用 CHROME_PATH 覆盖 */
const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

export function resolveChromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const found = CHROME_CANDIDATES.find((p) => existsSync(p));
  // 不指定 executablePath 时 playwright-core 会用它自带的 chromium（若已下载）
  return found;
}

export function launchOptions() {
  const executablePath = resolveChromePath();
  return executablePath ? { executablePath, headless: true } : { headless: true };
}

/** 所有 E2E 脚本共用，可通过 VERIFY_BASE_URL 覆盖（本地 dev / Docker 容器） */
export const BASE_URL = process.env.VERIFY_BASE_URL || 'http://127.0.0.1:5173/';
