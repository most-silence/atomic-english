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

import { tokenize } from './scoring.js';
import type { ReviewItem } from './types.js';

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

const DAY_MS = 24 * 60 * 60 * 1000;

/** SRS 排期：正确率越高间隔越长（1/2/4 天），错误当天再练 */
export function nextReviewDate(accuracy: number, from: Date = new Date()): string {
  const days = accuracy >= 0.9 ? 4 : accuracy >= 0.5 ? 2 : 1;
  return new Date(from.getTime() + days * DAY_MS).toISOString();
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
