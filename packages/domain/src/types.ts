export type Difficulty = 'easy' | 'normal' | 'hard';
export type LanguageCode = 'en-US' | 'en-GB';

export interface Challenge {
  id: number;
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

export interface Progress {
  streak: number;
  weeklyCompletion: number;
  todayPlayCount: number;
  freeTranslationsLeft: number;
  completedChallengeIds: number[];
}

export interface ReviewItem {
  word: string;
  sourceChallengeId: number;
  nextReviewAt: string;
}

export const FREE_TRANSLATIONS_PER_DAY = 6;

export function initialProgress(): Progress {
  return {
    streak: 0,
    weeklyCompletion: 0,
    todayPlayCount: 0,
    freeTranslationsLeft: FREE_TRANSLATIONS_PER_DAY,
    completedChallengeIds: [],
  };
}
