import { detectPlatform, isIOS, isSafari, isStandalone } from './platform';
import { isKeepAliveActive } from './keepAlive';
import { getVoiceInfos } from './webSpeech';
import type { AudioCapabilities } from './types';

/**
 * 运行时能力探测——诊断页与"能不能用"的判断都依赖它。
 * 探测结果会同时给出 notes，把已知的平台限制直接摆出来，而不是让用户遇到才猜。
 */
export function getAudioCapabilities(): AudioCapabilities {
  const platform = detectPlatform();
  const hasSpeechSynthesis =
    typeof window !== 'undefined' && 'speechSynthesis' in window;
  const voices = getVoiceInfos();
  const notes: string[] = [];

  if (!hasSpeechSynthesis) {
    notes.push('当前浏览器不支持语音合成（Firefox Android 无此能力）');
  } else if (voices.length === 0) {
    notes.push('未取到可用语音，可能是语音列表异步未就绪或系统未安装语音包');
  }

  if (isIOS()) {
    notes.push('iOS：speak() 必须在用户手势调用栈内，否则静默失败');
    notes.push('iOS：页面进入后台后语音合成会停止，已启用静音保活音轨兜底');
  }
  if (isSafari()) {
    notes.push('Safari：pitch/rate 被钳制，onend/onerror 可能不触发');
  }
  if (platform === 'desktop') {
    notes.push('桌面 Chrome：单条 utterance 超约 200~250 字符会被截断，已按句切片');
  }

  const nav = navigator as Navigator & {
    getAutoplayPolicy?: (type: string) => string;
  };

  return {
    platform,
    isSafari: isSafari(),
    isStandalone: isStandalone(),
    hasSpeechSynthesis,
    voiceCount: voices.length,
    voices,
    hasMediaSession: typeof navigator !== 'undefined' && 'mediaSession' in navigator,
    hasCacheApi: typeof caches !== 'undefined',
    autoplayPolicy:
      typeof nav.getAutoplayPolicy === 'function' ? nav.getAutoplayPolicy('audiocontext') : null,
    keepAliveActive: isKeepAliveActive(),
    requiresUserGesture: isIOS(),
    notes,
  };
}
