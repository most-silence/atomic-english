import { describe, expect, it, vi } from 'vitest';
import { consoleSink, createHttpSink } from './index';
import type { AnalyticsEvent } from '@atomic/db';

const events: AnalyticsEvent[] = [
  { id: 1, name: 'install_prompt_shown', createdAt: '2026-11-21T00:00:00Z' },
];

describe('consoleSink（P0 数据丢失回归）', () => {
  it('返回 false——绝不把事件假标记为已上报', async () => {
    // 若这里返回 true，flushEvents 会写 flushedAt，事件从此再也不会被真实 sink 上报
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    expect(await consoleSink.send(events)).toBe(false);
    expect(debug).toHaveBeenCalled();
    debug.mockRestore();
  });
});

describe('createHttpSink', () => {
  it('HTTP 失败时返回 false，事件留在队列', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetchMock);
    expect(await createHttpSink('/api/events').send(events)).toBe(false);
    vi.unstubAllGlobals();
  });

  it('HTTP 成功时返回 true', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    expect(await createHttpSink('/api/events').send(events)).toBe(true);
    vi.unstubAllGlobals();
  });

  it('请求抛错时返回 false', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);
    expect(await createHttpSink('/api/events').send(events)).toBe(false);
    vi.unstubAllGlobals();
  });
});
