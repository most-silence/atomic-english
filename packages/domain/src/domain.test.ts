import { describe, it, expect } from 'vitest';
import { scoreTranscript, formatAccuracy } from './scoring.js';
import { extractReviewWords, buildReviewItems, buildWrongWordReviewItems, reviewItemAfterPractice, dueReviewItems, scoreWord } from './review.js';
import { weeklyCompletion, currentStreak, markCompleted, formatWeekRange } from './progress.js';
import { currentChallenge, nextChallenge, courseProgress } from './course.js';
import { SEED_CHALLENGES } from './seed.js';

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

  it('完全匹配得 100%，忽略大小写与标点', () => {
    expect(scoreTranscript(SENTENCE, SENTENCE).accuracy).toBe(1);
    expect(scoreTranscript('i have started surfing again after years off', SENTENCE).accuracy).toBe(1);
  });

  it('重复词不重复命中', () => {
    expect(scoreTranscript('have have have', 'I have started').correctCount).toBe(1);
  });

  it('展示 token 保留原句大小写', () => {
    expect(scoreTranscript('I start', SENTENCE).displayTokens[0]).toBe('I');
  });
});

describe('词条抽取与 SRS', () => {
  it('过滤 I，保留 have 等 7 个词，按字母序', () => {
    expect(extractReviewWords(SENTENCE)).toEqual([
      'after', 'again', 'have', 'off', 'started', 'surfing', 'years',
    ]);
  });

  it('buildReviewItems 带初始 SRS 字段', () => {
    const items = buildReviewItems(593, SENTENCE, 0.125, new Date('2026-11-21T00:00:00Z'));
    expect(items).toHaveLength(7);
    expect(items[0]).toMatchObject({ lastAccuracy: 0.125, reviewedCount: 0 });
  });

  it('复习一次推进计数与到期时间', () => {
    const items = buildReviewItems(593, SENTENCE, 0.125);
    const practiced = reviewItemAfterPractice(items[0], 1.0);
    expect(practiced.reviewedCount).toBe(1);
    expect(practiced.lastAccuracy).toBe(1.0);
  });

  it('只返回到期词条', () => {
    const now = new Date('2026-11-21T00:00:00Z');
    const past = { ...buildReviewItems(593, SENTENCE, 0)[0], nextReviewAt: '2026-11-19T00:00:00Z' };
    const future = { ...buildReviewItems(593, SENTENCE, 0)[0], nextReviewAt: '2026-12-01T00:00:00Z' };
    expect(dueReviewItems([past, future], now).map((i) => i.word)).toEqual([past.word]);
  });
});

describe('进度计算（单一真相源 completedDates）', () => {
  it('周范围：2026-11-19 落在 11月16日-11月22日', () => {
    expect(formatWeekRange(new Date('2026-11-19T12:00:00'))).toBe('11月16日 - 11月22日');
  });

  it('markCompleted 去重且排序', () => {
    expect(markCompleted(['2026-11-20', '2026-11-18'], '2026-11-20'))
      .toEqual(['2026-11-18', '2026-11-20']);
  });

  it('完成 1 天 → 周完成率 1/7', () => {
    expect(weeklyCompletion(['2026-11-19'], new Date('2026-11-21T12:00:00')))
      .toBeCloseTo(1 / 7, 10);
  });

  it('连续天数：昨天完成、今天未做 → 1；今明都做按天递增', () => {
    expect(currentStreak(['2026-11-20'], new Date('2026-11-21T12:00:00'))).toBe(1);
    expect(currentStreak(['2026-11-20', '2026-11-21'], new Date('2026-11-21T12:00:00'))).toBe(2);
    expect(currentStreak([], new Date('2026-11-21T12:00:00'))).toBe(0);
  });
});

describe('课程取题', () => {
  it('首题是截图题 #593', () => {
    expect(currentChallenge(SEED_CHALLENGES, [])?.id).toBe(593);
  });

  it('答过 #593 后当前题前进到 #594', () => {
    const cur = currentChallenge(SEED_CHALLENGES, [{ challengeId: 593 }]);
    expect(cur?.id).toBe(594);
    expect(nextChallenge(SEED_CHALLENGES, [], 593)?.id).toBe(594);
  });

  it('全部答完后无当前题，课程完成度 100%', () => {
    const all = SEED_CHALLENGES.map((c) => ({ challengeId: c.id }));
    expect(currentChallenge(SEED_CHALLENGES, all)).toBeUndefined();
    const total = SEED_CHALLENGES.length;
    expect(courseProgress(SEED_CHALLENGES, all)).toEqual({ completed: total, total, ratio: 1 });
  });

  it('课程进行中完成度正确', () => {
    const total = SEED_CHALLENGES.length;
    expect(courseProgress(SEED_CHALLENGES, [{ challengeId: 593 }, { challengeId: 594 }]))
      .toEqual({ completed: 2, total, ratio: 2 / total });
  });
});

describe('词级错词本（buildWrongWordReviewItems）', () => {
  const NOW = new Date('2026-11-21T00:00:00Z');

  it('只入库未命中的实词，答对的不入库', () => {
    // SENTENCE: I have started surfing again after years off.
    // 命中 I / have / started，未命中 surfing / again / after / years / off
    const matched = [true, true, true, false, false, false, false, false];
    const items = buildWrongWordReviewItems(593, SENTENCE, matched, NOW);
    expect(items.map((i) => i.word)).toEqual(['after', 'again', 'off', 'surfing', 'years']);
  });

  it('虚词即使没命中也不入库', () => {
    // 全部未命中，但 I 是虚词应被过滤
    const items = buildWrongWordReviewItems(593, SENTENCE, new Array(8).fill(false), NOW);
    expect(items.map((i) => i.word)).toEqual([
      'after', 'again', 'have', 'off', 'started', 'surfing', 'years',
    ]);
    expect(items.every((i) => i.word !== 'i')).toBe(true);
  });

  it('新错词立即到期，词级 accuracy 记为 0', () => {
    const items = buildWrongWordReviewItems(593, SENTENCE, new Array(8).fill(false), NOW);
    expect(items[0].nextReviewAt).toBe(NOW.toISOString());
    expect(items.every((i) => i.lastAccuracy === 0)).toBe(true);
    expect(items.every((i) => i.reviewedCount === 0)).toBe(true);
  });

  it('全命中时不产生复习词条', () => {
    const items = buildWrongWordReviewItems(593, SENTENCE, new Array(8).fill(true), NOW);
    expect(items).toEqual([]);
  });

  it('重复错词只入库一次', () => {
    const items = buildWrongWordReviewItems(1, 'off off off', [false, false, false], NOW);
    expect(items).toHaveLength(1);
    expect(items[0].word).toBe('off');
  });
});

describe('词级判分 scoreWord', () => {
  it('拼写正确得 1', () => {
    expect(scoreWord('surfing', 'surfing')).toBe(1);
  });

  it('形态错误得 0（不做词干归一，与整句规则一致）', () => {
    expect(scoreWord('surf', 'surfing')).toBe(0);
  });

  it('大小写不敏感', () => {
    expect(scoreWord('SURFING', 'surfing')).toBe(1);
  });
});
