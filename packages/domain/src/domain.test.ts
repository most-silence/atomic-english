import { describe, it, expect } from 'vitest';
import { scoreTranscript, formatAccuracy } from './scoring.js';
import { extractReviewWords } from './review.js';
import { weeklyCompletion, currentStreak, formatWeekRange } from './progress.js';

const SENTENCE = 'I have started surfing again after years off.';

describe('判分算法（截图证据：I start → 12.50%）', () => {
  it('复现截图的 12.50%：只有 I 精确命中，start ≠ started', () => {
    const result = scoreTranscript('I start', SENTENCE);
    expect(result.accuracy).toBeCloseTo(0.125, 10);
    expect(formatAccuracy(result.accuracy)).toBe('12.50%');
    expect(result.correctCount).toBe(1);
    expect(result.totalCount).toBe(8);
    expect(result.userMatched).toEqual([true, false]);
  });

  it('完全匹配得 100%', () => {
    expect(scoreTranscript(SENTENCE, SENTENCE).accuracy).toBe(1);
  });

  it('忽略大小写与标点', () => {
    expect(scoreTranscript('i have started surfing again after years off', SENTENCE).accuracy).toBe(1);
  });

  it('重复词不重复命中', () => {
    const r = scoreTranscript('have have have', 'I have started');
    expect(r.correctCount).toBe(1);
  });

  it('逐词命中标记与原句 token 一一对应', () => {
    const r = scoreTranscript('I start', SENTENCE);
    expect(r.targetTokens).toHaveLength(8);
    expect(r.matched).toHaveLength(8);
    expect(r.matched[0]).toBe(true);
    expect(r.matched.filter(Boolean)).toHaveLength(1);
  });
});

describe('词条抽取（截图证据：7 个字母序词条）', () => {
  it('过滤 I，保留 have 等 7 个词，按字母序排列', () => {
    expect(extractReviewWords(SENTENCE)).toEqual([
      'after', 'again', 'have', 'off', 'started', 'surfing', 'years',
    ]);
  });
});

describe('进度计算', () => {
  it('周范围：2026-11-19 落在 11月16日-11月22日', () => {
    expect(formatWeekRange(new Date('2026-11-19T12:00:00'))).toBe('11月16日 - 11月22日');
  });

  it('本周完成 1 天 → 周完成率 1/7', () => {
    const r = weeklyCompletion(['2026-11-19T10:00:00Z'], new Date('2026-11-21T12:00:00'));
    expect(r).toBeCloseTo(1 / 7, 10);
  });

  it('连续天数：昨天完成、今天未算 → streak 1', () => {
    const s = currentStreak(['2026-11-20T10:00:00Z'], new Date('2026-11-21T12:00:00'));
    expect(s).toBe(1);
  });
});
