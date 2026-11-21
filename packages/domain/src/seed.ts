import type { Challenge } from './types.js';

/**
 * 种子题库（31 道 ≈ 一个月的量）。第一题沿用截图 B 原题（#593），
 * 其余为同难度的日常英语句，覆盖 easy/normal/hard 三档，支持连续多日使用。
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
  {
    id: 600, date: '2026-11-26',
    sentence: 'I left my umbrella at home this morning.',
    translation: '我今天早上把伞落在家里了。',
    audioDurationMs: 1900, difficulty: 'easy',
  },
  {
    id: 601, date: '2026-11-27',
    sentence: 'She has been working here since last summer.',
    translation: '她从去年夏天起就一直在这里工作。',
    audioDurationMs: 2200, difficulty: 'normal',
  },
  {
    id: 602, date: '2026-11-28',
    sentence: 'The children were playing in the park when it began to rain.',
    translation: '下雨时孩子们正在公园里玩。',
    audioDurationMs: 2700, difficulty: 'hard',
  },
  {
    id: 603, date: '2026-11-29',
    sentence: 'Could you tell me where the nearest subway station is?',
    translation: '你能告诉我最近的地铁站在哪里吗？',
    audioDurationMs: 2400, difficulty: 'normal',
  },
  {
    id: 604, date: '2026-11-30',
    sentence: 'We had dinner at a small restaurant near the beach.',
    translation: '我们在海边一家小餐馆吃了晚饭。',
    audioDurationMs: 2100, difficulty: 'easy',
  },
  {
    id: 605, date: '2026-12-01',
    sentence: 'He always checks his email before he goes to work.',
    translation: '他总是在上班前查看邮件。',
    audioDurationMs: 2200, difficulty: 'normal',
  },
  {
    id: 606, date: '2026-12-02',
    sentence: 'I have never seen such a beautiful sunset in my life.',
    translation: '我这辈子从没见过这么美的日落。',
    audioDurationMs: 2400, difficulty: 'normal',
  },
  {
    id: 607, date: '2026-12-03',
    sentence: 'The book that you lent me is really interesting.',
    translation: '你借我的那本书真的很有意思。',
    audioDurationMs: 2100, difficulty: 'hard',
  },
  {
    id: 608, date: '2026-12-04',
    sentence: 'They will move to a new apartment next month.',
    translation: '他们下个月要搬进新公寓。',
    audioDurationMs: 1900, difficulty: 'easy',
  },
  {
    id: 609, date: '2026-12-05',
    sentence: 'It takes me about twenty minutes to walk to the office.',
    translation: '我步行到办公室大约要二十分钟。',
    audioDurationMs: 2300, difficulty: 'normal',
  },
  {
    id: 610, date: '2026-12-06',
    sentence: 'She asked me if I could help her with the homework.',
    translation: '她问我能不能帮她做作业。',
    audioDurationMs: 2200, difficulty: 'hard',
  },
  {
    id: 611, date: '2026-12-07',
    sentence: 'I usually drink a glass of water right after I wake up.',
    translation: '我通常起床后马上喝一杯水。',
    audioDurationMs: 2300, difficulty: 'easy',
  },
  {
    id: 612, date: '2026-12-08',
    sentence: 'The meeting has been moved to three o clock in the afternoon.',
    translation: '会议已经改到下午三点。',
    audioDurationMs: 2300, difficulty: 'normal',
  },
  {
    id: 613, date: '2026-12-09',
    sentence: 'My brother is learning how to drive a car.',
    translation: '我弟弟正在学开车。',
    audioDurationMs: 1800, difficulty: 'easy',
  },
  {
    id: 614, date: '2026-12-10',
    sentence: 'We decided to stay at home because of the heavy snow.',
    translation: '因为大雪我们决定待在家里。',
    audioDurationMs: 2200, difficulty: 'normal',
  },
  {
    id: 615, date: '2026-12-11',
    sentence: 'The film was so boring that I fell asleep halfway through.',
    translation: '那部电影太无聊了，我看到一半就睡着了。',
    audioDurationMs: 2500, difficulty: 'hard',
  },
  {
    id: 616, date: '2026-12-12',
    sentence: 'Could you please turn down the music a little bit?',
    translation: '你能把音乐调小一点吗？',
    audioDurationMs: 1900, difficulty: 'easy',
  },
  {
    id: 617, date: '2026-12-13',
    sentence: 'I am looking forward to seeing my old friends again.',
    translation: '我期待着再次见到我的老朋友们。',
    audioDurationMs: 2100, difficulty: 'normal',
  },
  {
    id: 618, date: '2026-12-14',
    sentence: 'She bought a new laptop online last weekend.',
    translation: '她上周末在网上买了一台新笔记本电脑。',
    audioDurationMs: 1900, difficulty: 'easy',
  },
  {
    id: 619, date: '2026-12-15',
    sentence: 'The weather is getting colder, so remember to wear a coat.',
    translation: '天气越来越冷了，记得穿外套。',
    audioDurationMs: 2400, difficulty: 'normal',
  },
  {
    id: 620, date: '2026-12-16',
    sentence: 'He has finished the report and sent it to his manager.',
    translation: '他已经完成报告并发给了经理。',
    audioDurationMs: 2200, difficulty: 'hard',
  },
  {
    id: 621, date: '2026-12-17',
    sentence: 'There is a small garden behind the house.',
    translation: '房子后面有一个小花园。',
    audioDurationMs: 1700, difficulty: 'easy',
  },
  {
    id: 622, date: '2026-12-18',
    sentence: 'I called him twice, but he did not answer the phone.',
    translation: '我给他打了两次电话，但他都没接。',
    audioDurationMs: 2100, difficulty: 'normal',
  },
];
