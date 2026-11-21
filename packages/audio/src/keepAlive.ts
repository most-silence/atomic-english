/**
 * iOS 后台播放保活 + 锁屏媒体信息。
 *
 * 背景（均有出处，见 docs/research/pwa-audio-spike.md）：
 *  - iOS Safari 在页面进入后台后会停止 speechSynthesis；
 *  - iOS 只允许"持续有音频输出"的应用在后台继续播放，
 *    公开的绕过办法是循环播放一段几秒的静音/极低音量音频，
 *    保证不存在"完全没在播放"的瞬间；
 *  - Web Audio 的 AudioContext 在熄屏后会被挂起，所以保活必须用 HTMLAudioElement；
 *  - Media Session API 能让系统保持音频会话并展示锁屏控制。
 *
 * 注意：这段音频振幅压到约 -58 dBFS，手机上听不见，但解码器仍在持续产出帧。
 */

let keepAliveEl: HTMLAudioElement | null = null;
let keepAliveUrl: string | null = null;

export interface ToneOptions {
  seconds?: number;
  sampleRate?: number;
  freq?: number;
  /** 0..1，这里默认取听不见的极低振幅 */
  amplitude?: number;
}

/** 生成一段低振幅正弦波的 WAV Blob——用于保活与缓存链路自测。 */
export function makeToneWavBlob(options: ToneOptions = {}): Blob {
  const seconds = options.seconds ?? 2;
  const sampleRate = options.sampleRate ?? 8000;
  const freq = options.freq ?? 1000;
  const amplitude = options.amplitude ?? 0.0012;

  const samples = Math.max(1, Math.floor(seconds * sampleRate));
  const pcm = new Int16Array(samples);
  for (let i = 0; i < samples; i++) {
    pcm[i] = Math.round(amplitude * 32767 * Math.sin((2 * Math.PI * freq * i) / sampleRate));
  }

  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM 头长度
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // 单声道
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) view.setInt16(44 + i * 2, pcm[i], true);

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * 启动保活音频。
 * **必须在用户手势的同步调用栈里调用**，否则 iOS 会拒绝播放。
 */
export function startKeepAlive(): boolean {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return false;
  if (keepAliveEl) return true;
  try {
    const url = URL.createObjectURL(makeToneWavBlob());
    const el = new Audio(url);
    el.loop = true;
    el.preload = 'auto';
    el.setAttribute('playsinline', 'true');
    const played = el.play();
    if (played && typeof played.catch === 'function') played.catch(() => undefined);
    keepAliveEl = el;
    keepAliveUrl = url;
    return true;
  } catch {
    return false;
  }
}

export function stopKeepAlive(): void {
  if (keepAliveEl) {
    try {
      keepAliveEl.pause();
      keepAliveEl.src = '';
    } catch {
      /* 忽略：停止失败不影响主流程 */
    }
    keepAliveEl = null;
  }
  if (keepAliveUrl) {
    URL.revokeObjectURL(keepAliveUrl);
    keepAliveUrl = null;
  }
}

export function isKeepAliveActive(): boolean {
  return keepAliveEl !== null;
}

/** 更新锁屏/通知栏的媒体信息；返回是否成功。 */
export function updateMediaSession(title: string, artist = 'Atomic English'): boolean {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return false;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      album: '每日听写挑战',
    });
    return true;
  } catch {
    return false;
  }
}
