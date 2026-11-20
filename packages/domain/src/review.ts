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
  const nextReviewAt = nextReviewDate(accuracy, now);
  return extractReviewWords(sentence).map((word) => ({
    word,
    sourceChallengeId: challengeId,
    nextReviewAt,
  }));
}
