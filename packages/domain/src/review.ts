/**
 * 词条抽取——由截图反推（见 reverse 文档 §2.2）：
 * 原句 `I have started surfing again after years off.`
 * → 复习列表 `after / again / have / off / started / surfing / years`（`I` 被过滤）
 * 即：去标点、小写化、过滤代词/冠词等虚词，保留实词。
 */

const STOP_WORDS = new Set([
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'its', 'our', 'their', 'a', 'an', 'the',
  'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
  'do', 'does', 'did',
  'and', 'or', 'but', 'if', 'so', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'from', 'by',
]);

import { scoreTranscript, tokenize } from './scoring.js';
import type { ReviewItem } from './types.js';

/** 单个词听写判分：复用整句判分引擎，目标是单词时 accuracy 非 1 即 0 */
export function scoreWord(input: string, word: string): number {
  const tokens = tokenize(word);
  if (!tokens.length) return 0;
  const result = scoreTranscript(input, word);
  return result.accuracy;
}

/** 从挑战句中抽取复习词条（小写、去重、过滤虚词） */
export function extractReviewWords(sentence: string): string[] {
  const seen = new Set<string>();
  const words: string[] = [];
  for (const token of tokenize(sentence)) {
    if (STOP_WORDS.has(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    words.push(token);
  }
  // 截图中的复习词条为字母序：after / again / have / off / started / surfing / years
  return words.sort((a, b) => a.localeCompare(b));
}

export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * SRS 档位单一来源：顺序从高到低匹配，取第一个 minAccuracy 达标者。
 * 排期函数与 UI 文案都从这里派生，避免两处各写一套阈值和天数。
 */
export const SRS_TIERS = [
  { minAccuracy: 0.9, intervalDays: 4, label: '已安排 4 天后再复习' },
  { minAccuracy: 0.5, intervalDays: 2, label: '已安排 2 天后再复习' },
  { minAccuracy: 0, intervalDays: 1, label: '明天再练一次' },
] as const;

export function srsTierFor(accuracy: number): (typeof SRS_TIERS)[number] {
  return SRS_TIERS.find((tier) => accuracy >= tier.minAccuracy) ?? SRS_TIERS[SRS_TIERS.length - 1];
}

/** SRS 排期：正确率越高间隔越长，由 SRS_TIERS 决定 */
export function nextReviewDate(accuracy: number, from: Date = new Date()): string {
  const { intervalDays } = srsTierFor(accuracy);
  return new Date(from.getTime() + intervalDays * DAY_MS).toISOString();
}

export function buildReviewItems(
  challengeId: number,
  sentence: string,
  accuracy: number,
  now: Date = new Date(),
): ReviewItem[] {
  // 新抽出的词条立即进入"待复习"（now），答对后复习才推后到 nextReviewDate。
  // 这样刚作答完就能在复习 tab 看到错词，与截图行为一致。
  const nextReviewAt = now.toISOString();
  return extractReviewWords(sentence).map((word) => ({
    word,
    sourceChallengeId: challengeId,
    nextReviewAt,
    lastAccuracy: accuracy,
    reviewedCount: 0,
  }));
}

/** 复习一次后推进 SRS：按新判分重排 nextReviewAt，计数 +1 */
export function reviewItemAfterPractice(item: ReviewItem, accuracy: number, now = new Date()): ReviewItem {
  return {
    ...item,
    nextReviewAt: nextReviewDate(accuracy, now),
    lastAccuracy: accuracy,
    reviewedCount: item.reviewedCount + 1,
  };
}

/** 到期的词条（nextReviewAt <= now），按到期时间升序 */
export function dueReviewItems(items: ReviewItem[], now = new Date()): ReviewItem[] {
  return items
    .filter((item) => new Date(item.nextReviewAt) <= now)
    .sort((a, b) => a.nextReviewAt.localeCompare(b.nextReviewAt));
}

/**
 * 从判分结果构建**真正的错词本**：只入库用户没命中的实词。
 *
 * 与 buildReviewItems（历史遗留，入库全部实词）的区别：
 * - matched[i] === false 的词才入库——答对的词不该反复占用复习时间
 * - lastAccuracy 用 0（词级错误），不是整句正确率
 *
 * matched 与 targetTokens 一一对应（见 scoring.ts），而 tokenize(sentence)
 * 与 displayTokens(sentence) 同序，所以可以按索引取词。
 */
export function buildWrongWordReviewItems(
  challengeId: number,
  sentence: string,
  matched: boolean[],
  now: Date = new Date(),
): ReviewItem[] {
  const words = tokenize(sentence);
  const seen = new Set<string>();
  const items: ReviewItem[] = [];

  words.forEach((word, index) => {
    if (STOP_WORDS.has(word) || seen.has(word)) return;
    if (matched[index] !== false) return; // 命中或越界都不入库
    seen.add(word);
    items.push({
      word,
      sourceChallengeId: challengeId,
      // 新错词立即到期，打开复习页就能练
      nextReviewAt: now.toISOString(),
      lastAccuracy: 0,
      reviewedCount: 0,
    });
  });

  return items.sort((a, b) => a.word.localeCompare(b.word));
}
