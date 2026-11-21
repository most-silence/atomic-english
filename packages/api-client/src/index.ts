export * from './sync.js';
export * from './supabase.js';

import type { AnalyticsEvent } from '@atomic/db';

/**
 * 埋点上报出口。阶段二只有本地队列，sink 默认实现为「打印到控制台并视为成功」；
 * 接 Supabase / 自建 API 时只需换一个实现，业务侧的 track() 调用不用动。
 *
 * 这是 §8.4「接口先做成多客户端就绪」纪律在埋点上的应用。
 */
export interface AnalyticsSink {
  readonly name: string;
  send(events: AnalyticsEvent[]): Promise<boolean>;
}

/** 默认 sink：仅打印，不产生网络请求。返回 true 让事件标记为已上报。 */
export const consoleSink: AnalyticsSink = {
  name: 'console',
  async send(events) {
    for (const event of events) {
      // 用 debug 级别，不污染正常控制台错误检查
      console.debug('[analytics]', event.name, event.payload ?? {});
    }
    return true;
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
        const response = await fetch(endpoint, {
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
