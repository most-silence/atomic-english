import { useEffect, useState } from 'react';
import {
  buildReviewItems,
  currentStreak,
  initialProgress,
  scoreTranscript,
  SEED_CHALLENGES,
  type Progress,
  type ReviewItem,
  type ScoreResult,
} from '@atomic/domain';
import {
  loadProgress,
  loadReviewItems,
  saveAttempt,
  saveProgress,
  saveReviewItems,
} from '@atomic/db';
import Header from './components/Header';
import BottomNav, { type Tab } from './components/BottomNav';
import ChallengePage from './pages/ChallengePage';
import ReviewPage from './pages/ReviewPage';
import StreakPage from './pages/StreakPage';

const CHALLENGE = SEED_CHALLENGES[0];
const DEMO_DATE = '2026-11-20T10:00:00Z';

export default function App() {
  const [tab, setTab] = useState<Tab>('challenge');
  const [progress, setProgress] = useState<Progress | null>(null);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [transcript, setTranscript] = useState('I start');
  const [playCount, setPlayCount] = useState(4);
  const [lastScore, setLastScore] = useState<ScoreResult | null>(null);
  const [resetToken, setResetToken] = useState(0);

  useEffect(() => {
    (async () => {
      let p = await loadProgress();
      if (!p) {
        p = initialProgress();
        p.streak = 1;
        p.todayPlayCount = 4;
        p.completedChallengeIds = [CHALLENGE.id];
        // 截图 A 观测值为 13%；1/7≈14.3% 与原产品不符，故演示态直接采用观测值
        // （原产品很可能按更细的粒度计权，无源码不臆断，见 reverse 文档 §2.4）
        p.weeklyCompletion = 0.13;
        await saveProgress(p);
        const result = scoreTranscript('I start', CHALLENGE.sentence);
        await saveAttempt({
          challengeId: CHALLENGE.id,
          transcript: 'I start',
          playCount: 4,
          accuracy: result.accuracy,
          createdAt: DEMO_DATE,
        });
        const items = buildReviewItems(CHALLENGE.id, CHALLENGE.sentence, result.accuracy);
        await saveReviewItems(items);
      }
      setProgress(p);
      setReviewItems(await loadReviewItems());
    })();
  }, []);

  if (!progress) {
    return <div className="app"><Header /><div className="page" /></div>;
  }

  const streak = currentStreak(
    progress.completedChallengeIds.map((id) => {
      const d = id === CHALLENGE.id ? DEMO_DATE : new Date().toISOString();
      return d;
    }),
    new Date('2026-11-21T12:00:00'),
  ) || progress.streak;

  const bumpPlayCount = () => {
    setProgress((prev) => {
      if (!prev) return prev;
      const next = { ...prev, todayPlayCount: prev.todayPlayCount + 1 };
      void saveProgress(next);
      return next;
    });
  };

  const handleSubmit = (result: ScoreResult, text: string, plays: number) => {
    setLastScore(result);
    setTranscript(text);
    setPlayCount(plays);
    void saveAttempt({
      challengeId: CHALLENGE.id,
      transcript: text,
      playCount: plays,
      accuracy: result.accuracy,
      createdAt: new Date().toISOString(),
    });
    const items = buildReviewItems(CHALLENGE.id, CHALLENGE.sentence, result.accuracy);
    void saveReviewItems(items);
    setReviewItems(items);
    setProgress((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        completedChallengeIds: Array.from(new Set([...prev.completedChallengeIds, CHALLENGE.id])),
        freeTranslationsLeft: prev.freeTranslationsLeft,
      };
      void saveProgress(next);
      return next;
    });
  };

  const handleTranslate = () => {
    setProgress((prev) => {
      if (!prev) return prev;
      const next = { ...prev, freeTranslationsLeft: Math.max(0, prev.freeTranslationsLeft - 1) };
      void saveProgress(next);
      return next;
    });
  };

  return (
    <div className="app">
      <Header />
      {tab === 'challenge' && (
        <ChallengePage
          key={resetToken}
          challenge={CHALLENGE}
          streak={streak}
          initialTranscript={transcript}
          initialPlayCount={playCount}
          initialScore={lastScore === null && resetToken === 0
            ? scoreTranscript('I start', CHALLENGE.sentence) : lastScore}
          initialShowTranslation={resetToken === 0}
          freeTranslationsLeft={progress.freeTranslationsLeft}
          onPlay={bumpPlayCount}
          onSubmit={handleSubmit}
          onTranslate={handleTranslate}
          onNext={() => { setLastScore(null); setResetToken((n) => n + 1); }}
        />
      )}
      {tab === 'streak' && (
        <StreakPage streak={streak} completion={progress.weeklyCompletion} />
      )}
      {tab === 'review' && (
        <ReviewPage
          items={reviewItems}
          completion={progress.weeklyCompletion}
          playCount={progress.todayPlayCount}
          onPlay={bumpPlayCount}
        />
      )}
      <BottomNav active={tab} onChange={setTab} />
    </div>
  );
}
