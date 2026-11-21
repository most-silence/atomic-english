export * from './sync.js';
export * from './supabase.js';
export * from './translation.js';

export * from './http.js';

import type { AnalyticsEvent } from '@atomic/db';
import { fetchWithTimeout } from './http.js';

/**
 * 埋点上报出口。业务侧只调 track()，出口实现可替换（Supabase / 自建 API）。
 *
 * 这是 §8.4「接口先做成多客户端就绪」纪律在埋点上的应用。
 * 关键约束：只有真正上报成功的 sink 才返回 true；返回 false 的事件留在本地队列。
 */
export interface AnalyticsSink {
  readonly name: string;
  send(events: AnalyticsEvent[]): Promise<boolean>;
}

/**
 * 默认 sink：仅打印到控制台，**不视为已上报**。
 *
 * 返回 false 是刻意设计——若返回 true，flushEvents 会把事件标记为 flushedAt，
 * 而 loadPendingEvents 只取未 flushed 的行，事件就永远不会再被真正的 sink 上报。
 * 没有配置后端时宁可让队列留在本地，也不能静默丢数据。
 */
export const consoleSink: AnalyticsSink = {
  name: 'console',
  async send(events) {
    for (const event of events) {
      // 用 debug 级别，不污染正常控制台错误检查
      console.debug('[analytics]', event.name, event.payload ?? {});
    }
    return false;
  },
};

/**
 * HTTP sink：把事件 POST 到指定端点。
 * 失败时返回 false，事件会留在本地队列里等下次重试（不丢数据）。
 */
export function createHttpSink(endpoint: string): AnalyticsSink {
  return {
    name: 'http',
    async send(events) {
      try {
        const response = await fetchWithTimeout(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            events: events.map(({ name, payload, createdAt }) => ({ name, payload, createdAt })),
          }),
          keepalive: true,
        });
        return response.ok;
      } catch {
        return false;
      }
    },
  };
}
