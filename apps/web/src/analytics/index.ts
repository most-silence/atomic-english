import { consoleSink, type AnalyticsSink } from '@atomic/api-client';
import { loadPendingEvents, markEventsFlushed, pruneFlushedEvents, saveEvent } from '@atomic/db';

/**
 * 埋点通道：事件先落 IndexedDB，联网后由 sink 上报。
 *
 * 为什么先做本地队列而不是直接 POST：iOS 存储可被系统清理、用户随时断网、
 * 安装漏斗恰恰发生在"刚装完、网络未必稳"的时刻。先落盘再上报，失败可重试。
 *
 * 纪律：没有真实 sink 时不 flush——consoleSink 返回 false，事件留在队列里，
 * 等 setAnalyticsSink() 注入真实出口后立即上报，绝不静默丢数据。
 */

const FLUSH_INTERVAL_MS = 60_000;

let sink: AnalyticsSink = consoleSink;
let flushing: Promise<number> | null = null;
let initialized = false;

export type EventPayload = Record<string, string | number | boolean | null>;

/** 记录一个事件（同步入队，不等待网络） */
export async function track(name: string, payload?: EventPayload): Promise<void> {
  await saveEvent(name, payload);
}

/**
 * 替换上报出口。真实 sink 注入后立即冲刷排队事件，
 * 消除「initAnalytics 在 sink 注入前就 flush」的启动竞态。
 */
export function setAnalyticsSink(next: AnalyticsSink): void {
  sink = next;
  if (next.name !== consoleSink.name) void flushEvents();
}

/** 上报所有待发送事件，返回本次成功发送的数量。并发调用会复用同一次 flush。 */
export function flushEvents(): Promise<number> {
  // 没有真实出口时不要动队列，避免无意义轮询（consoleSink 恒返回 false）
  if (sink.name === consoleSink.name) return Promise.resolve(0);
  if (flushing) return flushing;
  flushing = (async () => {
    const pending = await loadPendingEvents();
    if (!pending.length) return 0;
    const ok = await sink.send(pending);
    if (!ok) return 0;
    // id 是自增主键，从 IndexedDB 读出的事件必然有 id；显式过滤而非断言
    const ids = pending.flatMap((e) => (e.id == null ? [] : [e.id]));
    await markEventsFlushed(ids);
    return ids.length;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/**
 * 安装自动上报：恢复联网时、每 60 秒各试一次。
 * 只注册一次，避免 React StrictMode 双挂载造成重复定时器。
 * 不在启动时立即 flush——真实 sink 注入时会冲刷；未注入时队列本来就留着。
 */
export function initAnalytics(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  window.addEventListener('online', () => void flushEvents());
  window.setInterval(() => {
    if (navigator.onLine) void flushEvents();
  }, FLUSH_INTERVAL_MS);
  // 已上报事件保留 30 天供审计，定期清理避免 IndexedDB 无限增长
  window.setInterval(() => void pruneFlushedEvents(), 60 * 60 * 1000);
}
