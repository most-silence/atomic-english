/** 进度计算：全部由 completedDates（YYYY-MM-DD）派生，单一真相源。 */

const DAY_MS = 24 * 60 * 60 * 1000;

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function isoOf(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 周一为一周起点 */
export function weekRange(date: Date = new Date()): { start: Date; end: Date } {
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() + mondayOffset);
  const end = new Date(start.getTime() + 6 * DAY_MS);
  return { start, end };
}

export function formatWeekRange(date: Date = new Date()): string {
  const { start, end } = weekRange(date);
  const fmt = (d: Date) => `${d.getMonth() + 1}月${d.getDate()}日`;
  return `${fmt(start)} - ${fmt(end)}`;
}

/** 周完成率 = 本周内已完成天数 / 7 */
export function weeklyCompletion(completedDates: string[], now: Date = new Date()): number {
  const { start, end } = weekRange(now);
  const inWeek = completedDates.filter((iso) => {
    const d = parseISO(iso);
    return d >= start && d <= end;
  });
  return inWeek.length / 7;
}

/** 连续天数：从今天（或昨天）往前数连续的已完成日期 */
export function currentStreak(completedDates: string[], now: Date = new Date()): number {
  const days = new Set(completedDates);
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!days.has(isoOf(cursor))) {
    cursor.setTime(cursor.getTime() - DAY_MS);
    if (!days.has(isoOf(cursor))) return 0;
  }
  let streak = 0;
  while (days.has(isoOf(cursor))) {
    streak += 1;
    cursor.setTime(cursor.getTime() - DAY_MS);
  }
  return streak;
}

/** 记录某日完成（去重、排序），返回新数组，不改原数组 */
export function markCompleted(
  completedDates: string[],
  dateISO: string,
): string[] {
  return Array.from(new Set([...completedDates, dateISO])).sort();
}

/** 完成率显示：本周已完成天数 / 7，四舍五入到整数百分比 */
export function formatCompletion(completion: number): string {
  return `${Math.round(completion * 100)}%`;
}

export function formatDateCN(iso: string): string {
  const d = parseISO(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}
