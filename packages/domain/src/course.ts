import type { Attempt, Challenge } from './types.js';

/**
 * 课程取题（纯函数）：题库按 id 顺序，取"尚未作答的第一题"作为当前挑战。
 * 全部作答完后返回 undefined（课程完成），由 UI 决定如何呈现。
 */
export function currentChallenge(
  challenges: Challenge[],
  attempts: Pick<Attempt, 'challengeId'>[],
): Challenge | undefined {
  const done = new Set(attempts.map((a) => a.challengeId));
  const sorted = [...challenges].sort((a, b) => a.id - b.id);
  return sorted.find((c) => !done.has(c.id));
}

/** 下一题：当前题之后的第一道未作答题（用于"下一题"按钮） */
export function nextChallenge(
  challenges: Challenge[],
  attempts: Pick<Attempt, 'challengeId'>[],
  afterId: number,
): Challenge | undefined {
  const done = new Set(attempts.map((a) => a.challengeId));
  const sorted = [...challenges].sort((a, b) => a.id - b.id);
  return sorted.find((c) => c.id > afterId && !done.has(c.id));
}

/** 课程完成度：已作答题数 / 总题数 */
export function courseProgress(
  challenges: Challenge[],
  attempts: Pick<Attempt, 'challengeId'>[],
): { completed: number; total: number; ratio: number } {
  const done = new Set(attempts.map((a) => a.challengeId));
  const ids = new Set(challenges.map((c) => c.id));
  const completed = [...done].filter((id) => ids.has(id)).length;
  const total = challenges.length;
  return { completed, total, ratio: total === 0 ? 0 : completed / total };
}
