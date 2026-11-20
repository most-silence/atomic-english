export default function StreakPage({ streak, completion }: { streak: number; completion: number }) {
  return (
    <div className="page">
      <div className="streak-hero">
        <div className="streak-number">{streak}</div>
        <div className="streak-caption">连续天数</div>
      </div>
      <WeekSummary completion={completion} />
    </div>
  );
}

function WeekSummary({ completion }: { completion: number }) {
  return (
    <div className="metrics" style={{ marginTop: 32 }}>
      <div>
        <div className="metric-value">{Math.round(completion * 100)}%</div>
        <div className="metric-label">本周完成率</div>
      </div>
      <div>
        <div className="metric-value">7</div>
        <div className="metric-label">每周目标</div>
      </div>
      <div>
        <div className="metric-value">#593</div>
        <div className="metric-label">当前挑战</div>
      </div>
    </div>
  );
}
