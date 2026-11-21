import { describe, expect, it } from 'vitest';
import {
  mergeAttempts,
  mergeReviewItems,
  mergeSnapshots,
  snapshotsEqual,
  type SyncSnapshot,
} from './sync';
import type { Attempt, Progress, ReviewItem } from './types';

const progress = (over: Partial<Progress> = {}): Progress => ({
  completedDates: [],
  todayPlayCount: 0,
  freeTranslationsLeft: 6,
  currentDate: '2026-11-21',
  ...over,
});

const attempt = (id: number, createdAt: string): Attempt => ({
  challengeId: id,
  transcript: `t${id}`,
  playCount: 1,
  accuracy: 0.5,
  createdAt,
});

const review = (word: string, count: number, next: string): ReviewItem => ({
  word,
  sourceChallengeId: 593,
  nextReviewAt: next,
  lastAccuracy: 0.5,
  reviewedCount: count,
});

describe('mergeProgress', () => {
  it('一侧为空时直接取另一侧', () => {
    const p = progress({ completedDates: ['2026-11-21'] });
    expect(mergeSnapshots({ progress: p, attempts: [], reviewItems: [] }, empty()).progress).toEqual(p);
    expect(mergeSnapshots(empty(), { progress: p, attempts: [], reviewItems: [] }).progress).toEqual(p);
  });

  it('completedDates 取并集，离线做的题不会被旧快照抹掉', () => {
    const local = progress({ completedDates: ['2026-11-20', '2026-11-21'] });
    const remote = progress({ completedDates: ['2026-11-19', '2026-11-20'] });
    const merged = mergeSnapshots(
      { progress: local, attempts: [], reviewItems: [] },
      { progress: remote, attempts: [], reviewItems: [] },
    ).progress!;
    expect(merged.completedDates).toEqual(['2026-11-19', '2026-11-20', '2026-11-21']);
  });

  it('同一天的额度取保守值：播放次数取大、剩余翻译取小', () => {
    const local = progress({ todayPlayCount: 3, freeTranslationsLeft: 2 });
    const remote = progress({ todayPlayCount: 1, freeTranslationsLeft: 5 });
    const merged = mergeSnapshots(
      { progress: local, attempts: [], reviewItems: [] },
      { progress: remote, attempts: [], reviewItems: [] },
    ).progress!;
    expect(merged.todayPlayCount).toBe(3);
    expect(merged.freeTranslationsLeft).toBe(2);
  });

  it('不同天时以较新那天的额度为准', () => {
    const old = progress({ currentDate: '2026-11-20', todayPlayCount: 9, freeTranslationsLeft: 0 });
    const fresh = progress({ currentDate: '2026-11-21', todayPlayCount: 1, freeTranslationsLeft: 6 });
    const a = mergeSnapshots(
      { progress: old, attempts: [], reviewItems: [] },
      { progress: fresh, attempts: [], reviewItems: [] },
    ).progress!;
    const b = mergeSnapshots(
      { progress: fresh, attempts: [], reviewItems: [] },
      { progress: old, attempts: [], reviewItems: [] },
    ).progress!;
    expect(a).toEqual(b); // 顺序无关
    expect(a.currentDate).toBe('2026-11-21');
    expect(a.todayPlayCount).toBe(1);
    expect(a.freeTranslationsLeft).toBe(6);
  });
});

describe('mergeAttempts', () => {
  it('合并两端记录并按时间排序', () => {
    const merged = mergeAttempts(
      [attempt(593, '2026-11-20T10:00:00Z')],
      [attempt(594, '2026-11-21T10:00:00Z')],
    );
    expect(merged.map((a) => a.challengeId)).toEqual([593, 594]);
  });

  it('相同 (challengeId, createdAt) 只保留一条', () => {
    const a = attempt(593, '2026-11-20T10:00:00Z');
    const merged = mergeAttempts([a], [{ ...a, transcript: '云端副本' }]);
    expect(merged).toHaveLength(1);
  });

  it('结果确定，与参数顺序无关', () => {
    const a = attempt(593, '2026-11-20T10:00:00Z');
    const b = attempt(594, '2026-11-21T10:00:00Z');
    expect(mergeAttempts([a], [b])).toEqual(mergeAttempts([b], [a]));
  });
});

describe('mergeReviewItems', () => {
  it('同一个词取复习次数更多的一条，SRS 状态不回退', () => {
    const local = review('surfing', 1, '2026-11-22');
    const remote = review('surfing', 3, '2026-11-25');
    const merged = mergeReviewItems([local], [remote]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual(remote);
  });

  it('不同词各自保留', () => {
    const merged = mergeReviewItems(
      [review('after', 1, '2026-11-22')],
      [review('years', 2, '2026-11-25')],
    );
    expect(merged.map((r) => r.word)).toEqual(['after', 'years']);
  });

  it('次数相同时取 nextReviewAt 更晚的', () => {
    const a = review('off', 1, '2026-11-22');
    const b = review('off', 1, '2026-11-25');
    expect(mergeReviewItems([a], [b])[0]).toEqual(b);
    expect(mergeReviewItems([b], [a])[0]).toEqual(b);
  });
});

describe('snapshotsEqual', () => {
  it('相同快照判定为相等', () => {
    const s: SyncSnapshot = {
      progress: progress(),
      attempts: [attempt(593, '2026-11-20T10:00:00Z')],
      reviewItems: [review('after', 1, '2026-11-22')],
    };
    expect(snapshotsEqual(s, structuredClone(s))).toBe(true);
  });

  it('有差异时判定为不等', () => {
    const base = { progress: progress(), attempts: [], reviewItems: [] };
    const changed = { ...base, progress: progress({ todayPlayCount: 1 }) };
    expect(snapshotsEqual(base, changed)).toBe(false);
  });
});

function empty(): SyncSnapshot {
  return { progress: null, attempts: [], reviewItems: [] };
}
