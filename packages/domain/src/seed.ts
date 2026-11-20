import type { Challenge } from './types.js';

/**
 * 种子题库（7 道 = 一周的量）。第一题沿用截图 B 原题（#593），
 * 其余为同难度的日常英语句，便于把"做一题→下一题"的全流程真实跑通。
 * 日期字段用于展示；取题顺序由 id 决定（见 course.ts）。
 */
export const SEED_CHALLENGES: Challenge[] = [
  {
    id: 593, date: '2026-11-19',
    sentence: 'I have started surfing again after years off.',
    translation: '时隔多年，我又开始冲浪了。',
    audioDurationMs: 2000, difficulty: 'normal',
  },
  {
    id: 594, date: '2026-11-20',
    sentence: 'She reads a book before bed every night.',
    translation: '她每天晚上睡前读一本书。',
    audioDurationMs: 2200, difficulty: 'easy',
  },
  {
    id: 595, date: '2026-11-21',
    sentence: 'We walked along the river after the rain stopped.',
    translation: '雨停后我们沿着河边散步。',
    audioDurationMs: 2600, difficulty: 'normal',
  },
  {
    id: 596, date: '2026-11-22',
    sentence: 'He has never tried sushi in his life.',
    translation: '他这辈子从没吃过寿司。',
    audioDurationMs: 2100, difficulty: 'normal',
  },
  {
    id: 597, date: '2026-11-23',
    sentence: 'The train arrives at the station at eight tomorrow.',
    translation: '火车明天八点到站。',
    audioDurationMs: 2500, difficulty: 'hard',
  },
  {
    id: 598, date: '2026-11-24',
    sentence: 'They are building a new bridge near my house.',
    translation: '他们在我家附近建一座新桥。',
    audioDurationMs: 2300, difficulty: 'normal',
  },
  {
    id: 599, date: '2026-11-25',
    sentence: 'I would like a cup of coffee with milk, please.',
    translation: '我想要一杯加奶的咖啡，谢谢。',
    audioDurationMs: 2400, difficulty: 'easy',
  },
];
