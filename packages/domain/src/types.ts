export type Difficulty = 'easy' | 'normal' | 'hard';
export type LanguageCode = 'en-US' | 'en-GB';

export interface Challenge {
  id: number;
  /** YYYY-MM-DD：该挑战归属的日期 */
  date: string;
  sentence: string;
  translation: string;
  audioDurationMs: number;
  difficulty: Difficulty;
}

export interface Attempt {
  challengeId: number;
  transcript: string;
  playCount: number;
  accuracy: number;
  createdAt: string;
}

/**
 * 进度真相源是 completedDates（YYYY-MM-DD，去重）。
 * streak / weeklyCompletion 均由它派生，不再单独存储——避免两处状态不一致。
 */
export interface Progress {
  completedDates: string[];
  todayPlayCount: number;
  freeTranslationsLeft: number;
  /** 今日展示日期，用于"今日挑战"取题；默认取运行当天 */
  currentDate: string;
}

export interface ReviewItem {
  word: string;
  sourceChallengeId: number;
  nextReviewAt: string;
  /** 最近一次复习判分，用于 SRS 间隔 */
  lastAccuracy: number;
  reviewedCount: number;
}

export const FREE_TRANSLATIONS_PER_DAY = 6;

export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function initialProgress(now: Date = new Date()): Progress {
  return {
    completedDates: [],
    todayPlayCount: 0,
    freeTranslationsLeft: FREE_TRANSLATIONS_PER_DAY,
    currentDate: todayISO(now),
  };
}
