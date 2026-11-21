import { formatCompletion, formatWeekRange } from '@atomic/domain';

export function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="4 12 10 18 20 6" />
    </svg>
  );
}

export function HeadphonesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </svg>
  );
}

export default function WeekStats({
  completion,
  playCount,
  now = new Date(),
}: {
  completion: number;
  playCount: number;
  now?: Date;
}) {
  return (
    <div className="week-row">
      <span className="week-label">{formatWeekRange(now)}</span>
      <span className="week-stats">
        <span className="stat"><CheckIcon />{formatCompletion(completion)}</span>
        <span className="stat"><HeadphonesIcon />{playCount}</span>
      </span>
    </div>
  );
}
