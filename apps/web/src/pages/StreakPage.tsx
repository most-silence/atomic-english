export default function StreakPage({
  streak,
  completion,
  currentChallengeId,
  totalChallenges,
}: {
  streak: number;
  completion: number;
  /** 当前待作答挑战 id，无待作答时为 null */
  currentChallengeId: number | null;
  /** 题库总数，用于每周目标展示 */
  totalChallenges: number;
}) {
  return (
    <div className="page">
      <div className="streak-hero">
        <div className="streak-number">{streak}</div>
        <div className="streak-caption">连续天数</div>
      </div>
      <WeekSummary
        completion={completion}
        currentChallengeId={currentChallengeId}
        totalChallenges={totalChallenges}
      />
    </div>
  );
}

function WeekSummary({
  completion,
  currentChallengeId,
  totalChallenges,
}: {
  completion: number;
  currentChallengeId: number | null;
  totalChallenges: number;
}) {
  return (
    <div className="metrics" style={{ marginTop: 32 }}>
      <div>
        <div className="metric-value">{Math.round(completion * 100)}%</div>
        <div className="metric-label">本周完成率</div>
      </div>
      <div>
        <div className="metric-value">{totalChallenges}</div>
        <div className="metric-label">题库总数</div>
      </div>
      <div>
        <div className="metric-value">
          {currentChallengeId === null ? '已完成' : `#${currentChallengeId}`}
        </div>
        <div className="metric-label">当前挑战</div>
      </div>
    </div>
  );
}
