import type { AudioProvider, PlaybackHandle, PlaybackOutcome } from './types';

/**
 * 预录音频适配器（HTMLAudioElement）+ Cache API 预缓存。
 *
 * 为什么要有第二条路径：
 *  - Web Speech API 是"实时合成"，没有网络就没有声音，也不受我们控制音质；
 *  - 一旦课程配有预录音频（母语发音、慢速版、例句），就必须走 <audio>，
 *    而且这些音频要能**离线可听**——这是学习类应用的核心诉求之一。
 *
 * 缓存策略用 Cache API（而不是 IndexedDB）：可直接存 Response，
 * 命中后用 blob URL 喂给 <audio>，避免重复下载。
 */

export const AUDIO_CACHE_NAME = 'atomic-audio-v1';

function hasCacheApi(): boolean {
  return typeof caches !== 'undefined';
}

/** 预取并缓存一个音频文件。返回是否成功。 */
export async function prefetchAudio(url: string): Promise<boolean> {
  if (!hasCacheApi()) return false;
  try {
    const cache = await caches.open(AUDIO_CACHE_NAME);
    if (await cache.match(url)) return true;
    const response = await fetch(url);
    if (!response.ok) return false;
    await cache.put(url, response.clone());
    return true;
  } catch {
    return false;
  }
}

/** 取缓存中的音频并转成 blob URL；未命中返回 null。 */
export async function getCachedAudioUrl(url: string): Promise<string | null> {
  if (!hasCacheApi()) return null;
  try {
    const cache = await caches.open(AUDIO_CACHE_NAME);
    const hit = await cache.match(url);
    if (!hit) return null;
    const blob = await hit.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

/** 清空音频缓存，返回是否成功。 */
export async function clearAudioCache(): Promise<boolean> {
  if (!hasCacheApi()) return false;
  try {
    return await caches.delete(AUDIO_CACHE_NAME);
  } catch {
    return false;
  }
}

/** 统计音频缓存条目数。 */
export async function countCachedAudio(): Promise<number> {
  if (!hasCacheApi()) return 0;
  try {
    const cache = await caches.open(AUDIO_CACHE_NAME);
    return (await cache.keys()).length;
  } catch {
    return 0;
  }
}

export class HtmlAudioProvider implements AudioProvider {
  readonly name = 'html-audio';

  /** 按文本发音在此实现下无意义，调用方应改用 playUrl。 */
  speak(_text: string, _lang: string): PlaybackHandle {
    return {
      stop: () => undefined,
      done: Promise.resolve<PlaybackOutcome>('error'),
      provider: this.name,
    };
  }

  /** 播放一个音频 URL，优先命中缓存。 */
  async playUrl(url: string): Promise<PlaybackHandle> {
    const cached = await getCachedAudioUrl(url);
    const src = cached ?? url;
    const element = new Audio(src);
    element.preload = 'auto';
    element.setAttribute('playsinline', 'true');

    let settle: (outcome: PlaybackOutcome) => void = () => undefined;
    const done = new Promise<PlaybackOutcome>((resolve) => {
      settle = resolve;
    });

    element.onended = () => settle('ended');
    element.onerror = () => settle('error');

    try {
      await element.play();
    } catch {
      settle('error');
    }

    return {
      stop: () => {
        try {
          element.pause();
          element.currentTime = 0;
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
