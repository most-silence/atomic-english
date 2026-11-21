/**
 * 平台判定（音频侧）。
 *
 * 与 apps/web/src/pwa/platform.ts 重复是有意为之：packages/* 之间不互相依赖，
 * 音频适配层必须能被别的端（Capacitor/Tauri 壳）单独复用。
 */

export type Platform = 'ios' | 'android' | 'desktop' | 'unknown';

export function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'unknown';
  const s = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(s)) return 'ios';
  // iPadOS 13+ 伪装成桌面 Safari，靠触点数区分
  if (/Macintosh/.test(s) && (navigator.maxTouchPoints ?? 0) > 1) return 'ios';
  if (/Android/i.test(s)) return 'android';
  if (/Mac|Windows|Linux/i.test(s)) return 'desktop';
  return 'unknown';
}

export function isIOS(): boolean {
  return detectPlatform() === 'ios';
}

export function isSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const s = navigator.userAgent || '';
  if (!/safari/i.test(s)) return false;
  return !/crios|fxios|edgios|chrome|android/i.test(s);
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  if (typeof window.matchMedia !== 'function') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches
  );
}
