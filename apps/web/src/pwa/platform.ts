/**
 * 平台判定：安装引导、音频策略都依赖它。
 * 这些差异是"浏览器事实"而非猜测——iOS 无 beforeinstallprompt、Safari 无自动播放豁免等，
 * 都有明确来源（见 docs/research/pwa-audio-spike.md）。
 */

export type Platform = 'ios' | 'android' | 'desktop' | 'unknown';

function ua(): string {
  return typeof navigator === 'undefined' ? '' : navigator.userAgent;
}

/** iOS（含 iPadOS 13+ 桌面 UA 伪装成 Mac 的情形） */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const s = ua();
  if (/iPad|iPhone|iPod/.test(s)) return true;
  // iPadOS 13+ 默认发送 "MacIntel"，靠触点数区分
  return /Macintosh/.test(s) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1;
}

export function isAndroid(): boolean {
  return /Android/i.test(ua());
}

/** Safari（含 iOS 上的所有浏览器——iOS 只有 WebKit 内核） */
export function isSafari(): boolean {
  const s = ua();
  if (!/safari/i.test(s)) return false;
  // Chrome / Edge / Firefox on iOS 都带 Safari 关键字，得排除掉
  return !/crios|fxios|edgios|chrome|android/i.test(s);
}

export function detectPlatform(): Platform {
  if (isIOS()) return 'ios';
  if (isAndroid()) return 'android';
  if (/Mac|Windows|Linux/i.test(ua())) return 'desktop';
  return 'unknown';
}

/** 是否以"独立应用"模式运行（已添加到主屏幕） */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches ||
        window.matchMedia('(display-mode: minimal-ui)').matches
    : false;
}

/** 是否支持 beforeinstallprompt（仅 Chromium 系） */
export function supportsInstallPrompt(): boolean {
  return typeof window !== 'undefined' && 'onbeforeinstallprompt' in window;
}
