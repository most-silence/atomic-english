import { useCallback, useEffect, useState } from 'react';
import { track } from '../analytics';
import { detectPlatform, isIOS, isSafari, isStandalone, supportsInstallPrompt } from './platform';

/**
 * 安装提示。
 *
 * 关键事实（决定了这里的分支）：
 *  - Chromium（Chrome/Edge/Samsung）会派发 beforeinstallprompt，可以自己弹安装框；
 *  - Safari / Firefox **不派发该事件**，iOS 上唯一路径是「分享 → 添加到主屏幕」，
 *    所以这些平台只能给图文引导，不能给按钮（源码：openpwa install-prompt 参考、
 *    Web Almanac 2025 PWA 采用率，见 docs/research/pwa-audio-spike.md）。
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

export interface InstallState {
  /** 浏览器已给出可安装信号，可以调起系统安装框 */
  canPrompt: boolean;
  /** 已经以独立应用模式运行 */
  installed: boolean;
  /** 需要用户手动走系统分享菜单（iOS/Safari） */
  needsManualSteps: boolean;
  platform: ReturnType<typeof detectPlatform>;
}

export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      // 阻止浏览器自带的迷你横幅，改由我们自己决定何时提示
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      void track('install_prompt_shown', { platform: detectPlatform() });
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
      void track('app_installed', { platform: detectPlatform() });
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<InstallOutcome> => {
    if (!deferred) return 'unavailable';
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      // 事件只能消费一次
      setDeferred(null);
      const outcome: InstallOutcome = choice.outcome === 'accepted' ? 'accepted' : 'dismissed';
      void track(outcome === 'accepted' ? 'install_accepted' : 'install_dismissed', {
        platform: detectPlatform(),
      });
      return outcome;
    } catch {
      setDeferred(null);
      void track('install_unavailable', { platform: detectPlatform() });
      return 'unavailable';
    }
  }, [deferred]);

  const platform = detectPlatform();
  const state: InstallState = {
    canPrompt: deferred !== null,
    installed,
    // iOS 与 Safari 都没有自动安装入口，只能引导用户手动添加
    needsManualSteps: isIOS() || isSafari(),
    platform,
  };

  return { ...state, promptInstall, supportsPromptEvent: supportsInstallPrompt() };
}
