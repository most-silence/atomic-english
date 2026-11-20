import Dexie, { type Table } from 'dexie';
import type { Attempt, Progress, ReviewItem } from '@atomic/domain';

/** 本地持久化：进度、作答记录、复习词条。存储后端隔离在此，业务代码只见 repository 接口。 */
export class AtomicDB extends Dexie {
  progress!: Table<Progress & { key: string }, string>;
  attempts!: Table<Attempt & { id: number }, number>;
  reviewItems!: Table<ReviewItem & { id: string }, string>;

  constructor() {
    super('atomic-english');
    this.version(1).stores({
      progress: 'key',
      attempts: '++id, challengeId, createdAt',
      reviewItems: 'id, word, nextReviewAt',
    });
  }
}

export const db = new AtomicDB();

export async function loadProgress(): Promise<Progress | undefined> {
  const row = await db.progress.get('main');
  return row as Progress | undefined;
}

export async function saveProgress(progress: Progress): Promise<void> {
  await db.progress.put({ ...progress, key: 'main' });
}

export async function saveAttempt(attempt: Attempt): Promise<void> {
  // Dexie 的自增主键在 add 时由库生成，类型上不必提供 id
  await db.attempts.add(attempt as Attempt & { id: number });
}

export async function saveReviewItems(items: ReviewItem[]): Promise<void> {
  await db.reviewItems.bulkPut(
    items.map((item) => ({ ...item, id: `${item.sourceChallengeId}:${item.word}` })),
  );
}

export async function loadReviewItems(): Promise<ReviewItem[]> {
  return db.reviewItems.toArray();
}
