import { consoleSink, type AnalyticsSink } from '@atomic/api-client';
import { loadPendingEvents, markEventsFlushed, saveEvent } from '@atomic/db';

/**
 * 埋点通道：事件先落 IndexedDB，联网后由 sink 上报。
 *
 * 为什么先做本地队列而不是直接 POST：iOS 存储可被系统清理、用户随时断网、
 * 安装漏斗恰恰发生在"刚装完、网络未必稳"的时刻。先落盘再上报，失败可重试。
 * 当前 sink 是 console（阶段二无后端）；接 Supabase 时换成 createHttpSink 即可。
 */

let sink: AnalyticsSink = consoleSink;
let flushing: Promise<number> | null = null;
let initialized = false;

export type EventPayload = Record<string, string | number | boolean | null>;

/** 记录一个事件（同步入队，不等待网络） */
export async function track(name: string, payload?: EventPayload): Promise<void> {
  await saveEvent(name, payload);
}

/** 替换上报出口。Supabase 接入后调用 setAnalyticsSink(createHttpSink('/api/events'))。 */
export function setAnalyticsSink(next: AnalyticsSink): void {
  sink = next;
}

/** 上报所有待发送事件，返回本次成功发送的数量。并发调用会复用同一次 flush。 */
export function flushEvents(): Promise<number> {
  if (flushing) return flushing;
  flushing = (async () => {
    const pending = await loadPendingEvents();
    if (!pending.length) return 0;
    const ok = await sink.send(pending);
    if (!ok) return 0;
    await markEventsFlushed(pending.map((e) => e.id as number));
    return pending.length;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/**
 * 安装自动上报：启动时、恢复联网时、每 60 秒各试一次。
 * 只注册一次，避免 React StrictMode 双挂载造成重复定时器。
 */
export function initAnalytics(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  void flushEvents();
  window.addEventListener('online', () => void flushEvents());
  window.setInterval(() => {
    if (navigator.onLine) void flushEvents();
  }, 60_000);
}
