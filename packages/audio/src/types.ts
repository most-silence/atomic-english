/** 音频适配层的公共类型。 */

/**
 * 播放结束原因。
 * - ended：收到正常的 onend 事件
 * - watchdog：超过时长估算仍未收到 onend（iOS Safari 已知会丢事件），由看门狗兜底
 * - stopped：被调用方主动停止
 * - error：合成器报错
 */
export type PlaybackOutcome = 'ended' | 'watchdog' | 'stopped' | 'error';

export interface PlaybackHandle {
  /** 停止当前播放 */
  stop: () => void;
  /** 播放结束（或被停止）时 resolve，值为结束原因 */
  done: Promise<PlaybackOutcome>;
  /** 实际执行播放的提供方，便于诊断 */
  provider?: string;
}

export interface AudioProvider {
  readonly name: string;
  speak(text: string, lang: string): PlaybackHandle;
}

export interface VoiceInfo {
  name: string;
  lang: string;
  localService: boolean;
  default: boolean;
}

export interface AudioCapabilities {
  platform: 'ios' | 'android' | 'desktop' | 'unknown';
  isSafari: boolean;
  isStandalone: boolean;
  hasSpeechSynthesis: boolean;
  voiceCount: number;
  voices: VoiceInfo[];
  hasMediaSession: boolean;
  hasCacheApi: boolean;
  /** 预生成音频 manifest 是否已加载（预录路径可用性） */
  audioManifestLoaded: boolean;
  /** 预生成音频条目数 */
  audioEntryCount: number;
  /** Chrome 专有：'allowed' | 'allowed-muted' | 'disallowed' */
  autoplayPolicy: string | null;
  keepAliveActive: boolean;
  /** iOS 上 speak() 必须处在用户手势调用栈内 */
  requiresUserGesture: boolean;
  /** 本次探测发现的风险点，直接展示给开发者 */
  notes: string[];
}
