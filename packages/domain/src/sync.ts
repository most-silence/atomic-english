import type { Attempt, Progress, ReviewItem } from './types';

/**
 * 同步合并规则（纯函数）。
 *
 * 设计前提：**本地 Dexie 是真相源，云端只做备份 + 多端同步**。
 * 所以合并的目标是"绝不丢学习数据"，而不是"严格 last-write-wins"：
 *
 * - completedDates 是只增集合 → 取并集（设备 A 离线做的题不会因为设备 B 的旧快照被抹掉）
 * - todayPlayCount 取 max；freeTranslationsLeft 取 min → 保守，防止额度被旧快照刷回来
 * - attempts 是追加流水 → 按 (challengeId, createdAt) 去重后合并
 * - reviewItems 是 SRS 状态 → 按 (sourceChallengeId, word) 合并，取 reviewedCount 更大的那条
 *
 * 这些规则必须是确定性的：同样两个输入，无论先后调用都得到同一结果。
 * 否则 A、B 两端同步后会永久不一致。
 */

export interface SyncSnapshot {
  progress: Progress | null;
  attempts: Attempt[];
  reviewItems: ReviewItem[];
}

const EMPTY_SNAPSHOT: SyncSnapshot = { progress: null, attempts: [], reviewItems: [] };

function mergeProgress(local: Progress | null, remote: Progress | null): Progress | null {
  if (!local) return remote;
  if (!remote) return local;

  // completedDates 并集；空数组不覆盖非空
  const dates = Array.from(new Set([...local.completedDates, ...remote.completedDates])).sort();

  // 日期不同说明是不同"今天"的数据：取较新那天的额度，否则取保守值
  const newer =
    remote.currentDate > local.currentDate
      ? remote
      : local.currentDate > remote.currentDate
        ? local
        : null;

  return {
    completedDates: dates,
    todayPlayCount: newer
      ? newer.todayPlayCount
      : Math.max(local.todayPlayCount, remote.todayPlayCount),
    freeTranslationsLeft: newer
      ? newer.freeTranslationsLeft
      : Math.min(local.freeTranslationsLeft, remote.freeTranslationsLeft),
    currentDate: newer ? newer.currentDate : local.currentDate,
  };
}

function attemptKey(a: Attempt): string {
  return `${a.challengeId}:${a.createdAt}`;
}

/** 追加型记录：去重后按时间排序，不覆盖任何一条 */
export function mergeAttempts(local: Attempt[], remote: Attempt[]): Attempt[] {
  const seen = new Set<string>();
  const out: Attempt[] = [];
  for (const a of [...local, ...remote]) {
    const key = attemptKey(a);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function reviewKey(r: ReviewItem): string {
  return `${r.sourceChallengeId}:${r.word}`;
}

function reviewMaturity(r: ReviewItem): number {
  // reviewedCount 主排序；nextReviewAt 作为同次数时的 tie-break
  return r.reviewedCount * 1e12 + Date.parse(r.nextReviewAt || '') * 1e-3 || 0;
}

/**
 * SRS 状态合并：取"更成熟"的一条——复习次数更多的代表记得更牢，
 * 不应该被另一台设备的旧状态回退。
 */
export function mergeReviewItems(local: ReviewItem[], remote: ReviewItem[]): ReviewItem[] {
  const byKey = new Map<string, ReviewItem>();
  for (const r of local) byKey.set(reviewKey(r), r);
  for (const r of remote) {
    const existing = byKey.get(reviewKey(r));
    if (!existing || reviewMaturity(r) > reviewMaturity(existing)) {
      byKey.set(reviewKey(r), r);
    }
  }
  return Array.from(byKey.values()).sort((a, b) => a.word.localeCompare(b.word));
}

/** 合并两份快照，结果是新的对象，不修改入参。 */
export function mergeSnapshots(local: SyncSnapshot, remote: SyncSnapshot): SyncSnapshot {
  return {
    progress: mergeProgress(local.progress, remote.progress),
    attempts: mergeAttempts(local.attempts, remote.attempts),
    reviewItems: mergeReviewItems(local.reviewItems, remote.reviewItems),
  };
}

/** 判断两份快照是否一致（用于避免无意义的写入和同步）。 */
export function snapshotsEqual(a: SyncSnapshot, b: SyncSnapshot): boolean {
  return (
    JSON.stringify(a.progress ?? null) === JSON.stringify(b.progress ?? null) &&
    JSON.stringify(a.attempts) === JSON.stringify(b.attempts) &&
    JSON.stringify(a.reviewItems) === JSON.stringify(b.reviewItems)
  );
}

/** 空快照，用于首次同步。 */
export function emptySnapshot(): SyncSnapshot {
  return {
    progress: null,
    attempts: [],
    reviewItems: [],
  };
}

/** 快照是否为空（没有任何需要上传的数据）。 */
export function isEmptySnapshot(s: SyncSnapshot): boolean {
  return s.progress === null && s.attempts.length === 0 && s.reviewItems.length === 0;
}

export { EMPTY_SNAPSHOT };
