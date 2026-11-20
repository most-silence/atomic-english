import Dexie, { type Table } from 'dexie';
import type { Attempt, Progress, ReviewItem } from '@atomic/domain';

type ProgressRow = Progress & { key: string };
type AttemptRow = Attempt & { id: number };
type ReviewRow = ReviewItem & { id: string };

/** 本地持久化：进度、作答记录、复习词条。存储后端隔离在此，业务代码只见 repository 接口。 */
export class AtomicDB extends Dexie {
  progress!: Table<ProgressRow, string>;
  attempts!: Table<AttemptRow, number>;
  reviewItems!: Table<ReviewRow, string>;

  constructor() {
    super('atomic-english');
    // v1 的 progress 用了 completedChallengeIds；v2 改为 completedDates + currentDate。
    // 旧结构无法直接映射，清空进度表让领域层按初始状态重建（作答记录保留）。
    this.version(1).stores({
      progress: 'key',
      attempts: '++id, challengeId, createdAt',
      reviewItems: 'id, word, nextReviewAt',
    });
    this.version(2).stores({
      progress: 'key',
      attempts: '++id, challengeId, createdAt',
      reviewItems: 'id, word, nextReviewAt',
    }).upgrade(async (tx) => {
      await tx.table('progress').clear();
    });
  }
}

export const db = new AtomicDB();

export async function loadProgress(): Promise<Progress | undefined> {
  const row = await db.progress.get('main');
  if (!row) return undefined;
  const { key: _key, ...progress } = row;
  return progress;
}

export async function saveProgress(progress: Progress): Promise<void> {
  await db.progress.put({ ...progress, key: 'main' });
}

export async function saveAttempt(attempt: Attempt): Promise<void> {
  // Dexie 自增主键 add 时由库生成
  await db.attempts.add(attempt as AttemptRow);
}

export async function loadAttempts(): Promise<Attempt[]> {
  const rows = await db.attempts.toArray();
  return rows.map(({ id: _id, ...attempt }) => attempt);
}

export async function saveReviewItems(items: ReviewItem[]): Promise<void> {
  await db.reviewItems.bulkPut(
    items.map((item) => ({ ...item, id: `${item.sourceChallengeId}:${item.word}` })),
  );
}

export async function saveReviewItem(item: ReviewItem): Promise<void> {
  await db.reviewItems.put({ ...item, id: `${item.sourceChallengeId}:${item.word}` });
}

export async function loadReviewItems(): Promise<ReviewItem[]> {
  const rows = await db.reviewItems.toArray();
  // 兼容 v1 遗留数据：旧词条缺 lastAccuracy / reviewedCount，补默认值
  return rows.map(({ id: _id, ...item }) => ({
    ...item,
    lastAccuracy: item.lastAccuracy ?? 0,
    reviewedCount: item.reviewedCount ?? 0,
  }));
}

/** 重置全部本地数据，用于重跑全流程演示 */
export async function resetAll(): Promise<void> {
  await db.transaction('rw', db.progress, db.attempts, db.reviewItems, async () => {
    await db.progress.clear();
    await db.attempts.clear();
    await db.reviewItems.clear();
  });
}
