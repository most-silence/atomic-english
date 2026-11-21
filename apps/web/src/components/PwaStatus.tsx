import { useEffect, useRef, useState } from 'react';
import { track } from '../analytics';
import { useInstallPrompt } from '../pwa/useInstallPrompt';
import { useServiceWorker } from '../pwa/useServiceWorker';
import { useOnline } from '../pwa/useOnline';

const INSTALL_DISMISS_KEY = 'atomic:install-dismissed';

/**
 * PWA 状态条：离线提示 / 版本更新 / 安装引导。
 *
 * 安装引导只展示一次（记在 localStorage），避免打扰日常刷题。
 * iOS/Safari 没有 beforeinstallprompt，只能给「分享 → 添加到主屏幕」的图文引导。
 */
export default function PwaStatus() {
  const online = useOnline();
  const sw = useServiceWorker();
  const install = useInstallPrompt();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem(INSTALL_DISMISS_KEY) === '1');
  }, []);

  const dismiss = () => {
    localStorage.setItem(INSTALL_DISMISS_KEY, '1');
    setDismissed(true);
  };

  // 暴露给自动化验证脚本：浏览器是否真的派发了安装信号
  useEffect(() => {
    const w = window as unknown as { __atomicPwa?: unknown };
    w.__atomicPwa = {
      online,
      swRegistered: sw.registered,
      swUpdateReady: sw.updateReady,
      swError: sw.error,
      installPromptAvailable: install.canPrompt,
      installNeedsManualSteps: install.needsManualSteps,
      installed: install.installed,
      platform: install.platform,
    };
  }, [online, sw.registered, sw.updateReady, sw.error, install]);

  const showUpdate = sw.updateReady;
  const showOffline = !online;
  const showInstall = !install.installed && !dismissed && (install.canPrompt || install.needsManualSteps);

  // 漏斗埋点：每条状态条只记一次，避免重渲染重复上报
  const shownRef = useRef<Record<string, boolean>>({});
  useEffect(() => {
    for (const [key, visible] of [
      ['install_banner_shown', showInstall],
      ['pwa_offline_shown', showOffline],
      ['sw_update_shown', showUpdate],
    ] as const) {
      if (visible && !shownRef.current[key]) {
        shownRef.current[key] = true;
        void track(key, { platform: install.platform });
      }
    }
  }, [showInstall, showOffline, showUpdate, install.platform]);

  if (!showUpdate && !showOffline && !showInstall) return null;

  return (
    <div className="pwa-status">
      {showUpdate && (
        <div className="pwa-banner pwa-banner-update" data-testid="pwa-update">
          <span>发现新版本，刷新后生效</span>
          <button type="button" className="pwa-banner-btn" onClick={sw.applyUpdate}>
            刷新
          </button>
        </div>
      )}

      {showOffline && (
        <div className="pwa-banner pwa-banner-offline" data-testid="pwa-offline">
          <span>离线中 · 进度仍会保存在本机，联网后自动同步</span>
        </div>
      )}

      {showInstall && !showUpdate && (
        <div className="pwa-banner pwa-banner-install" data-testid="pwa-install">
          {install.canPrompt ? (
            <>
              <span>把 Atomic Learning 装到桌面，离线也能背单词</span>
              <button
                type="button"
                className="pwa-banner-btn"
                onClick={() => {
                  void install.promptInstall();
                }}
              >
                安装
              </button>
              <button
                type="button"
                className="pwa-banner-close"
                onClick={dismiss}
                aria-label="关闭"
              >
                ×
              </button>
            </>
          ) : (
            <>
              <span>在 Safari 中点「分享 → 添加到主屏幕」，即可像 App 一样使用</span>
              <button
                type="button"
                className="pwa-banner-close"
                onClick={dismiss}
                aria-label="关闭"
              >
                ×
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
