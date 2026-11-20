import { speak } from '@atomic/audio';
import type { ReviewItem } from '@atomic/domain';
import WeekStats from '../components/WeekStats';

export default function ReviewPage({
  items,
  completion,
  playCount,
  onPlay,
}: {
  items: ReviewItem[];
  completion: number;
  playCount: number;
  onPlay: () => void;
}) {
  const words = items.map((item) => item.word).sort((a, b) => a.localeCompare(b));

  return (
    <div className="page">
      <WeekStats completion={completion} playCount={playCount} />
      <div className="words">
        {words.map((word) => (
          <button
            type="button"
            className="word-pill"
            key={word}
            onClick={() => { speak(word, 'en-US'); onPlay(); }}
          >
            <span>{word}</span>
            <span className="play" aria-hidden />
          </button>
        ))}
      </div>
    </div>
  );
}
