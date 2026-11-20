/**
 * 音频适配器：阶段 1 用 Web Speech API 合成发音，零依赖、零成本。
 * 所有播放逻辑收敛在此，将来换预录 TTS / 云 TTS 时调用方无感（见 framework-selection §8.4）。
 */

export interface PlaybackHandle {
  stop: () => void;
  done: Promise<void>;
}

export interface AudioProvider {
  speak(text: string, lang: string): PlaybackHandle;
}

class WebSpeechProvider implements AudioProvider {
  speak(text: string, lang: string): PlaybackHandle {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return { stop: () => {}, done: Promise.resolve() };
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.9;
    const done = new Promise<void>((resolve) => {
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
    });
    window.speechSynthesis.speak(utterance);
    return { stop: () => window.speechSynthesis.cancel(), done };
  }
}

export const audio: AudioProvider = new WebSpeechProvider();

/** 播放英文单词/句子；返回句柄以便计数和停止。 */
export function speak(text: string, lang = 'en-US'): PlaybackHandle {
  return audio.speak(text, lang);
}
