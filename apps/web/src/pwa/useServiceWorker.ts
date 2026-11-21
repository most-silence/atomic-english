import { useCallback, useEffect, useState } from 'react';

export interface ServiceWorkerState {
  /** SW 已注册并进入 active */
  registered: boolean;
  /** 有新版本等待接管 */
  updateReady: boolean;
  /** 注册失败时的原因 */
  error: string | null;
  scope: string | null;
}

/**
 * 注册 Service Worker 并处理版本更新。
 *
 * 只在生产构建注册：dev server 下 SW 会缓存住模块、破坏 HMR。
 * 需要在 dev 里验证时，把 localStorage['atomic:sw'] 置为 '1' 即可。
 */
export function useServiceWorker(): ServiceWorkerState & { applyUpdate: () => void } {
  const [state, setState] = useState<ServiceWorkerState>({
    registered: false,
    updateReady: false,
    error: null,
    scope: null,
  });

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const forced = typeof localStorage !== 'undefined' && localStorage.getItem('atomic:sw') === '1';
    if (!import.meta.env.PROD && !forced) return;

    let cancelled = false;
    const url = `${import.meta.env.BASE_URL}sw.js`;

    navigator.serviceWorker
      .register(url, { scope: import.meta.env.BASE_URL })
      .then((reg) => {
        if (cancelled) return;
        setState((s) => ({ ...s, registered: true, scope: reg.scope }));

        // 已有新版本在等待
        if (reg.waiting) setState((s) => ({ ...s, updateReady: true }));
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              setState((s) => ({ ...s, updateReady: true }));
            }
          });
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setState((s) => ({ ...s, error: String(err?.message || err) }));
      });

    // 页面重新可见时检查更新
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        navigator.serviceWorker.getRegistration().then((reg) => {
          if (reg?.waiting) setState((s) => ({ ...s, updateReady: true }));
        });
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const applyUpdate = useCallback(() => {
    navigator.serviceWorker.getRegistration().then((reg) => {
      reg?.waiting?.postMessage('SKIP_WAITING');
      window.location.reload();
    });
  }, []);

  return { ...state, applyUpdate };
}
