import { startKeepAlive } from './keepAlive';
import type { AudioProvider, PlaybackHandle, PlaybackOutcome, VoiceInfo } from './types';

/**
 * Web Speech API 适配器。
 *
 * 踩过的坑（都有出处，见 docs/research/pwa-audio-spike.md）：
 *  1. iOS Safari 只在**用户手势调用栈内**才接受 speak()，否则静默失败、无任何报错；
 *  2. iOS Safari 15.4+ 的 getVoices() 可能返回空、voiceschanged 可能不触发；
 *  3. iOS Safari 的 onend / onerror 回调可能永远不来（页面进入后台时尤其明显）；
 *  4. 桌面 Chrome 对单条 utterance 有长度上限（约 200~250 字符 / 15 秒），
 *     超出会被从中间截断，所以长句必须切片；
 *  5. 网络语音（localService=false）会把朗读文本送到厂商服务器，
 *     教学场景涉及用户答案，优先选本地语音。
 */

/** 单条 utterance 的字符上限，留足余量避免 Chrome 截断。 */
const MAX_CHUNK_CHARS = 180;

let cachedVoices: SpeechSynthesisVoice[] = [];

/** 读取可用语音。Chrome/iOS 上是异步就绪的，所以监听 voiceschanged 并轮询兜底。 */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return Promise.resolve([]);
  }
  const synth = window.speechSynthesis;
  const immediate = synth.getVoices();
  if (immediate.length) {
    cachedVoices = immediate;
    return Promise.resolve(immediate);
  }
  return new Promise<SpeechSynthesisVoice[]>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      cachedVoices = synth.getVoices();
      resolve(cachedVoices);
    };
    synth.addEventListener('voiceschanged', finish, { once: true });
    const timer = window.setInterval(() => {
      if (synth.getVoices().length) {
        window.clearInterval(timer);
        finish();
      }
    }, 250);
    window.setTimeout(() => {
      window.clearInterval(timer);
      finish();
    }, 3000);
  });
}

export function getVoiceInfos(): VoiceInfo[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  const voices = window.speechSynthesis.getVoices();
  if (voices.length) cachedVoices = voices;
  return cachedVoices.map((v) => ({
    name: v.name,
    lang: v.lang,
    localService: v.localService,
    default: v.default,
  }));
}

function normalizeLang(lang: string): string {
  return lang.replace('_', '-').toLowerCase();
}

/**
 * 选音色：先精确匹配语言，再退到同语族；同层优先本地语音（不外传文本）。
 */
export function pickVoice(
  voices: SpeechSynthesisVoice[],
  lang: string,
): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  const want = normalizeLang(lang);
  const base = want.split('-')[0];
  const exact = voices.filter((v) => normalizeLang(v.lang) === want);
  const loose = voices.filter((v) => normalizeLang(v.lang).split('-')[0] === base);
  const pool = exact.length ? exact : loose;
  if (!pool.length) return null;
  return pool.find((v) => v.localService) ?? pool[0];
}

/**
 * 把长文本切成不超过 max 字符的片段。
 * 先按句末标点断句（断句处的停顿更自然），过长的句子再按词切。
 */
export function chunkText(text: string, max = MAX_CHUNK_CHARS): string[] {
  const normalized = text.trim();
  if (!normalized) return [];
  const sentences = normalized.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let current = '';

  const flush = () => {
    if (current) {
      chunks.push(current);
      current = '';
    }
  };

  for (const sentence of sentences) {
    if (sentence.length > max) {
      flush();
      let buffer = '';
      for (const word of sentence.split(/\s+/)) {
        if (buffer.length + word.length + 1 > max) {
          chunks.push(buffer);
          buffer = word;
        } else {
          buffer = buffer ? `${buffer} ${word}` : word;
        }
      }
      if (buffer) current = buffer;
      continue;
    }
    if (current.length + sentence.length + 1 > max) {
      flush();
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  flush();
  return chunks;
}

export class WebSpeechProvider implements AudioProvider {
  readonly name = 'web-speech';

  speak(text: string, lang: string): PlaybackHandle {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    const chunks = chunkText(text);

    let settle: (outcome: PlaybackOutcome) => void = () => undefined;
    const done = new Promise<PlaybackOutcome>((resolve) => {
      settle = resolve;
    });

    if (!synth || chunks.length === 0) {
      settle('error');
      return { stop: () => undefined, done, provider: this.name };
    }

    let stopped = false;
    let index = 0;
    let watchdog: number | null = null;

    const clearWatchdog = () => {
      if (watchdog !== null) {
        window.clearTimeout(watchdog);
        watchdog = null;
      }
    };

    const speakChunk = (chunk: string) => {
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.lang = lang;
      utterance.rate = 0.9;
      utterance.pitch = 1;
      const voice = pickVoice(cachedVoices, lang);
      if (voice) utterance.voice = voice;

      let advanced = false;
      const advance = (outcome: PlaybackOutcome) => {
        if (advanced) return;
        advanced = true;
        clearWatchdog();
        if (stopped) {
          settle('stopped');
          return;
        }
        if (index >= chunks.length) {
          settle(outcome);
          return;
        }
        speakChunk(chunks[index++]);
      };

      utterance.onend = () => advance('ended');
      utterance.onerror = () => advance('error');

      // 看门狗：iOS 上 onend/onerror 可能永不触发，用时长估算兜底，避免 UI 卡在"播放中"
      const words = chunk.split(/\s+/).length;
      const estimateMs = Math.max(1500, (words * 420) / utterance.rate);
      watchdog = window.setTimeout(() => advance('watchdog'), estimateMs + 2000);

      try {
        synth.speak(utterance);
      } catch {
        advance('error');
      }
    };

    try {
      synth.cancel();
    } catch {
      /* 忽略 */
    }
    speakChunk(chunks[index++]);

    return {
      stop: () => {
        stopped = true;
        clearWatchdog();
        try {
          synth.cancel();
        } catch {
          /* 忽略 */
        }
        settle('stopped');
      },
      done,
      provider: this.name,
    };
  }
}

/** 模块加载即开始拉取语音列表（不阻塞，不影响首屏） */
export function warmUpVoices(): void {
  if (typeof window === 'undefined') return;
  void loadVoices();
  if ('speechSynthesis' in window) {
    window.speechSynthesis.addEventListener('voiceschanged', () => {
      void loadVoices();
    });
  }
}

/**
 * iOS 上必须在用户手势里调用：唤醒合成器 + 启动后台保活音轨。
 * 必须在**手势处理器的同步栈**里调用，否则 iOS 会拒绝。
 */
export function unlockAudio(): { speechStarted: boolean; keepAliveStarted: boolean } {
  const result = { speechStarted: false, keepAliveStarted: false };
  if (typeof window === 'undefined') return result;

  // 保活音轨：iOS 后台继续播放的前提
  result.keepAliveStarted = startKeepAlive();

  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(' ');
    utterance.volume = 0;
    utterance.onerror = () => undefined;
    synth.speak(utterance);
    result.speechStarted = true;
  } catch {
    /* 忽略 */
  }
  return result;
}
