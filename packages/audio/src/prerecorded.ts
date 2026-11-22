import { HtmlAudioProvider } from './htmlAudio';
import type { AudioProvider, PlaybackHandle, PlaybackOutcome } from './types';
import { WebSpeechProvider } from './webSpeech';

/**
 * 预录音频优先的降级 provider —— Web 与 Android 端共用的统一入口。
 *
 * 降级链：
 *   1. 文本命中预生成音频 manifest → <audio> 播放本地 mp3（离线可用、不依赖设备 TTS）
 *   2. 未命中（新题未重新生成 / 动态文本）→ Web Speech API 实时合成
 *
 * 为什么这样设计：
 *   Android WebView 常缺英文 TTS 语音包，speechSynthesis.speak() 静默失败且无报错。
 *   预生成 mp3 作为静态资源随 Web 构建产物一起打包进 APK，用 <audio> 播放，
 *   彻底绕开不可控的系统 TTS；两端跑同一份代码与资源，能力天然一致。
 *
 * manifest 由 scripts/generate-audio.py 生成，路径 apps/web/public/audio/manifest.json。
 */
const MANIFEST_URL = '/audio/manifest.json';

interface Manifest {
  voice: string;
  rate: string;
  entries: Record<string, string>;
}

let manifest: Manifest | null = null;
let loadPromise: Promise<Manifest | null> | null = null;

/** 归一化查表键：去首尾空白、转小写、压缩空白。 */
export function normalizeKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * 加载 manifest。幂等——多次调用共用同一个 Promise。
 * 应在 App 启动时调用；未调用时 speak() 会退化为 Web Speech（不阻塞首屏）。
 */
export function loadAudioManifest(): Promise<Manifest | null> {
  if (manifest) return Promise.resolve(manifest);
  if (loadPromise) return loadPromise;
  loadPromise = fetch(MANIFEST_URL)
    .then((res) => (res.ok ? (res.json() as Promise<Manifest>) : null))
    .then((data) => {
      manifest = data;
      return data;
    })
    .catch(() => null);
  return loadPromise;
}

/** 当前是否已加载 manifest（诊断页用）。 */
export function isAudioManifestLoaded(): boolean {
  return manifest !== null;
}

/** 查询某个文本是否有预录音频 URL。 */
export function findAudioUrl(text: string): string | null {
  if (!manifest) return null;
  return manifest.entries[normalizeKey(text)] ?? null;
}

/** manifest 条目数（诊断页用）。 */
export function countAudioEntries(): number {
  return manifest ? Object.keys(manifest.entries).length : 0;
}

/** 仅供测试：注入 manifest，避免依赖网络。 */
export function setAudioManifestForTest(data: Manifest | null): void {
  manifest = data;
  loadPromise = null;
}

export class PrerecordedProvider implements AudioProvider {
  readonly name = 'prerecorded';

  private readonly html = new HtmlAudioProvider();
  private readonly fallback = new WebSpeechProvider();

  speak(text: string, lang: string): PlaybackHandle {
    // 同步返回句柄，真正的播放决策在 Promise 里完成：
    // 若 manifest 尚未加载，先等它加载完再查表，避免首屏首次点击因竞态回退到
    // Web Speech（在 Android WebView 上那意味着无声）。
    let inner: PlaybackHandle | null = null;
    let settledByStop = false;
    let resolveDone: (outcome: PlaybackOutcome) => void = () => undefined;
    const done = new Promise<PlaybackOutcome>((resolve) => {
      resolveDone = resolve;
    });

    const start = (url: string | null) => {
      if (settledByStop) return;
      // 命中预录 → <audio> 播放；未命中 → Web Speech 兜底。两条都转成统一句柄。
      const handle = url ? this.html.playUrl(url) : this.fallback.speak(text, lang);
      void Promise.resolve(handle).then((h) => {
        inner = h;
        if (settledByStop) {
          h.stop();
          return;
        }
        void h.done.then((outcome) => resolveDone(outcome));
      });
    };

    const url = findAudioUrl(text);
    if (url) {
      start(url);
    } else if (!isAudioManifestLoaded()) {
      // manifest 还在加载：等它，再按最终结果决定，不提前回退
      void loadAudioManifest().then(() => start(findAudioUrl(text)));
    } else {
      // manifest 已加载且确实没有这条 → 回退
      start(null);
    }

    return {
      stop: () => {
        settledByStop = true;
        inner?.stop();
        resolveDone('stopped');
      },
      done,
      provider: this.name,
    };
  }
}
