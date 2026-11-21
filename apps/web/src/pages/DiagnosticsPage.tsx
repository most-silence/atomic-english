import { useCallback, useEffect, useState } from 'react';
import {
  clearAudioCache,
  countCachedAudio,
  getAudioCapabilities,
  isKeepAliveActive,
  makeToneWavBlob,
  speak,
  startKeepAlive,
  unlockAudio,
  type AudioCapabilities,
} from '@atomic/audio';
import { useInstallPrompt } from '../pwa/useInstallPrompt';
import { useServiceWorker } from '../pwa/useServiceWorker';
import { useOnline } from '../pwa/useOnline';

/**
 * 阶段二 spike 诊断页（?diag=1）。
 *
 * 这不是给用户看的页面，是把"能不能用"变成可测量的数字：
 *  - PWA：SW 是否注册、是否拿到安装信号、当前是否在线；
 *  - 音频：能力探测 + 三条可交互的实测（解锁 / 发音 / 缓存往返）。
 *
 * 页面上的每一项都会写进 window.__atomicDiag，供自动化脚本断言。
 */

type Level = 'ok' | 'warn' | 'bad' | '';

interface LogLine {
  at: string;
  text: string;
}

declare global {
  interface Window {
    __atomicDiag?: {
      capabilities: AudioCapabilities | null;
      logs: string[];
      audioCacheEntries: number;
      unlockResult: unknown;
      lastPlayback: { outcome: string; elapsedMs: number } | null;
    };
  }
}

export default function DiagnosticsPage() {
  const online = useOnline();
  const sw = useServiceWorker();
  const install = useInstallPrompt();
  const [caps, setCaps] = useState<AudioCapabilities | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [cacheCount, setCacheCount] = useState(0);
  const [unlockResult, setUnlockResult] = useState<string>('未执行');
  const [lastPlayback, setLastPlayback] = useState<{ outcome: string; elapsedMs: number } | null>(
    null,
  );
  const [keepAlive, setKeepAlive] = useState(isKeepAliveActive());

  const log = useCallback((text: string) => {
    const at = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    setLogs((prev) => [...prev, { at, text }]);
  }, []);

  useEffect(() => {
    setCaps(getAudioCapabilities());
    void countCachedAudio().then(setCacheCount);
  }, []);

  // 暴露给自动化验证
  useEffect(() => {
    window.__atomicDiag = {
      capabilities: caps,
      logs: logs.map((l) => `${l.at} ${l.text}`),
      audioCacheEntries: cacheCount,
      unlockResult,
      lastPlayback,
    };
  }, [caps, logs, cacheCount, unlockResult, lastPlayback]);

  const runUnlock = () => {
    const result = unlockAudio();
    const text = `speech=${result.speechStarted} keepAlive=${result.keepAliveStarted}`;
    setUnlockResult(text);
    setKeepAlive(isKeepAliveActive());
    log(`解锁音频会话：${text}`);
  };

  const runSpeak = async () => {
    const sentence = 'After many years, I started surfing again.';
    const started = Date.now();
    log(`开始发音：${sentence}`);
    const handle = speak(sentence, 'en-US');
    const outcome = await handle.done;
    const elapsedMs = Date.now() - started;
    setLastPlayback({ outcome, elapsedMs });
    log(`发音结束：${outcome}，耗时 ${elapsedMs}ms`);
  };

  const runCacheRoundTrip = async () => {
    log('缓存往返测试：生成测试音频 → 写入 Cache API → 读回');
    const blob = makeToneWavBlob({ seconds: 1 });
    const url = URL.createObjectURL(blob);
    try {
      const response = await fetch(url);
      const cache = await caches.open('atomic-audio-v1');
      await cache.put('/__spike__/tone.wav', response);
      const hit = await cache.match('/__spike__/tone.wav');
      const size = hit ? (await hit.blob()).size : 0;
      const count = await countCachedAudio();
      setCacheCount(count);
      log(
        hit
          ? `缓存命中：${size} 字节，缓存条目 ${count}`
          : '缓存未命中：Cache API 写入失败',
      );
    } catch (err) {
      log(`缓存测试失败：${String(err)}`);
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const runClearCache = async () => {
    await clearAudioCache();
    const count = await countCachedAudio();
    setCacheCount(count);
    log(`已清空音频缓存，剩余条目 ${count}`);
  };

  const runKeepAlive = () => {
    const ok = startKeepAlive();
    setKeepAlive(isKeepAliveActive());
    log(`保活音轨：${ok ? '已启动' : '启动失败'}`);
  };

  const voices = caps?.voices ?? [];

  return (
    <div className="page">
      <p className="challenge-meta">阶段二 spike 诊断 · {new Date().toLocaleDateString('zh-CN')}</p>

      <section className="diag-section">
        <div className="diag-title">PWA</div>
        <Row k="Service Worker" v={sw.registered ? '已注册' : sw.error ? `失败：${sw.error}` : '未注册'} level={sw.registered ? 'ok' : 'warn'} />
        <Row k="SW 作用域" v={sw.scope ?? '—'} />
        <Row k="待更新版本" v={sw.updateReady ? '有' : '无'} level={sw.updateReady ? 'warn' : 'ok'} />
        <Row k="安装信号" v={install.canPrompt ? '已获得 beforeinstallprompt' : install.needsManualSteps ? '需手动添加到主屏幕' : '暂无'} level={install.canPrompt ? 'ok' : 'warn'} />
        <Row k="独立应用模式" v={install.installed ? '是' : '否'} />
        <Row k="网络" v={online ? '在线' : '离线'} level={online ? 'ok' : 'warn'} />
      </section>

      <section className="diag-section">
        <div className="diag-title">音频能力</div>
        <Row k="平台" v={caps?.platform ?? '—'} />
        <Row k="语音合成支持" v={caps?.hasSpeechSynthesis ? '支持' : '不支持'} level={caps?.hasSpeechSynthesis ? 'ok' : 'bad'} />
        <Row k="可用语音数" v={String(caps?.voiceCount ?? 0)} level={(caps?.voiceCount ?? 0) > 0 ? 'ok' : 'warn'} />
        <Row k="需用户手势" v={caps?.requiresUserGesture ? '是（iOS 强制）' : '否'} level={caps?.requiresUserGesture ? 'warn' : 'ok'} />
        <Row k="Media Session" v={caps?.hasMediaSession ? '支持' : '不支持'} />
        <Row k="Cache API" v={caps?.hasCacheApi ? '支持' : '不支持'} level={caps?.hasCacheApi ? 'ok' : 'bad'} />
        <Row k="自动播放策略" v={caps?.autoplayPolicy ?? '该浏览器不提供'} />
        <Row k="保活音轨" v={keepAlive ? '运行中' : '未启动'} level={keepAlive ? 'ok' : 'warn'} />
        <Row k="音频缓存条目" v={String(cacheCount)} />
      </section>

      {voices.length > 0 && (
        <section className="diag-section">
          <div className="diag-title">可用语音（前 6 个）</div>
          {voices.slice(0, 6).map((v, i) => (
            <Row
              key={`${v.name}-${i}`}
              k={`${v.name}`}
              v={`${v.lang}${v.localService ? ' · 本地' : ' · 云端'}`}
              level={v.localService ? 'ok' : 'warn'}
            />
          ))}
        </section>
      )}

      {caps && caps.notes.length > 0 && (
        <section className="diag-section">
          <div className="diag-title">已知平台限制</div>
          {caps.notes.map((n) => (
            <p key={n} style={{ fontSize: 13, color: '#8e8e93', lineHeight: 1.7, margin: '0 0 6px' }}>
              · {n}
            </p>
          ))}
        </section>
      )}

      <section className="diag-section">
        <div className="diag-title">交互测试</div>
        <div className="diag-actions">
          <button type="button" className="diag-btn" onClick={runUnlock} data-testid="diag-unlock">
            解锁音频会话
            <small>必须在用户手势内调用；iOS 上唤醒合成器并启动保活音轨</small>
          </button>
          <button type="button" className="diag-btn" onClick={runSpeak} data-testid="diag-speak">
            测试发音
            <small>播放一句话并报告结束原因（ended / watchdog）与耗时</small>
          </button>
          <button type="button" className="diag-btn" onClick={runKeepAlive} data-testid="diag-keepalive">
            启动保活音轨
            <small>循环播放极低振幅音频，用于 iOS 后台保持音频会话</small>
          </button>
          <button type="button" className="diag-btn" onClick={runCacheRoundTrip} data-testid="diag-cache">
            缓存往返测试
            <small>生成测试音频 → 写入 Cache API → 读回并比对大小</small>
          </button>
          <button type="button" className="diag-btn" onClick={runClearCache} data-testid="diag-clear-cache">
            清空音频缓存
          </button>
        </div>
      </section>

      <section className="diag-section">
        <div className="diag-title">运行日志</div>
        <div className="diag-log" data-testid="diag-log">
          {logs.length === 0 ? '（暂无操作）' : logs.map((l) => `[${l.at}] ${l.text}`).join('\n')}
        </div>
      </section>

      <button type="button" className="primary-btn" onClick={() => history.back()}>
        返回
      </button>
    </div>
  );
}

function Row({ k, v, level = '' }: { k: string; v: string; level?: Level }) {
  return (
    <div className="diag-row">
      <span className="diag-key">{k}</span>
      <span className={`diag-val ${level}`}>{v}</span>
    </div>
  );
}
