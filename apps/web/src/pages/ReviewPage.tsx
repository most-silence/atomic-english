import { speak } from '@atomic/audio';
import { dueReviewItems, type ReviewItem } from '@atomic/domain';
import WeekStats from '../components/WeekStats';

export default function ReviewPage({
  items,
  completion,
  playCount,
  onPlay,
  onPractice,
}: {
  items: ReviewItem[];
  completion: number;
  playCount: number;
  onPlay: () => void;
  onPractice: (item: ReviewItem, accuracy: number) => void;
}) {
  const due = dueReviewItems(items);
  const words = [...due].sort((a, b) => a.word.localeCompare(b.word));

  return (
    <div className="page">
      <WeekStats completion={completion} playCount={playCount} />
      <div className="review-summary">
        待复习 {due.length} / 共 {items.length} 个词条
      </div>
      <div className="words">
        {words.map((item) => (
          <button
            type="button"
            className="word-pill"
            key={`${item.sourceChallengeId}:${item.word}`}
            onClick={() => { speak(item.word, 'en-US'); onPlay(); }}
          >
            <span>{item.word}</span>
            <span className="play" aria-hidden />
          </button>
        ))}
      </div>
      {due.length > 0 && (
        <button
          type="button"
          className="primary-btn"
          style={{ marginTop: 28 }}
          onClick={() => words.forEach((item) => onPractice(item, 1.0))}
        >
          全部记住了（推进排期）
        </button>
      )}
      {items.length === 0 && (
        <p className="review-empty">完成挑战后，错词会出现在这里。</p>
      )}
    </div>
  );
}
