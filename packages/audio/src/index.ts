/**
 * 音频适配器：对外只暴露稳定接口，具体实现可替换。
 *
 * 阶段 1 用 Web Speech API 合成发音，零依赖、零成本；
 * 阶段 2 增加预录音频（HTMLAudioElement + Cache API）路径，
 * 为"离线可听""母语发音""慢速版"留好接口。
 *
 * 所有播放逻辑收敛在此，将来换云 TTS 时调用方无感（见 framework-selection §8.4）。
 */
import { WebSpeechProvider, warmUpVoices, unlockAudio } from './webSpeech';
import { HtmlAudioProvider } from './htmlAudio';
import {
  PrerecordedProvider,
  countAudioEntries,
  findAudioUrl,
  isAudioManifestLoaded,
  loadAudioManifest,
  normalizeKey,
  setAudioManifestForTest,
} from './prerecorded';
import type { AudioProvider, PlaybackHandle } from './types';

export type {
  AudioProvider,
  AudioCapabilities,
  PlaybackHandle,
  PlaybackOutcome,
  VoiceInfo,
} from './types';
export {
  chunkText,
  getVoiceInfos,
  loadVoices,
  pickVoice,
  unlockAudio,
  warmUpVoices,
  WebSpeechProvider,
} from './webSpeech';
export {
  AUDIO_CACHE_NAME,
  clearAudioCache,
  countCachedAudio,
  getCachedAudioUrl,
  HtmlAudioProvider,
  prefetchAudio,
} from './htmlAudio';
export {
  isKeepAliveActive,
  makeToneWavBlob,
  startKeepAlive,
  stopKeepAlive,
  updateMediaSession,
} from './keepAlive';
export {
  PrerecordedProvider,
  countAudioEntries,
  findAudioUrl,
  isAudioManifestLoaded,
  loadAudioManifest,
  normalizeKey,
  setAudioManifestForTest,
} from './prerecorded';
export { getAudioCapabilities } from './capabilities';
export { detectPlatform, isIOS, isSafari, isStandalone } from './platform';

// 默认走「预录音频优先、Web Speech 兜底」的统一链路。
// Web 与 Android（Capacitor 壳）共用同一份代码与静态资源，能力一致。
let activeProvider: AudioProvider = new PrerecordedProvider();
let htmlProvider: HtmlAudioProvider | null = null;

/** 切换音频实现（云 TTS、预录音频等接入点）。 */
export function setAudioProvider(provider: AudioProvider): void {
  activeProvider = provider;
}

/** 取得预录音频提供方（惰性创建，避免非音频场景也实例化）。 */
export function getHtmlAudioProvider(): HtmlAudioProvider {
  if (!htmlProvider) htmlProvider = new HtmlAudioProvider();
  return htmlProvider;
}

/** 播放英文单词/句子；返回句柄以便计数和停止。 */
export function speak(text: string, lang = 'en-US'): PlaybackHandle {
  return activeProvider.speak(text, lang);
}

/** 停止当前播放。 */
export function stopPlayback(handle: PlaybackHandle | null): void {
  handle?.stop();
}

// 提前拉一次语音列表（不阻塞首屏）
warmUpVoices();
