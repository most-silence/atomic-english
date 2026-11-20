import { useCallback, useEffect, useState } from 'react';
import {
  buildReviewItems,
  courseProgress,
  currentChallenge,
  currentStreak,
  initialProgress,
  markCompleted,
  reviewItemAfterPractice,
  SEED_CHALLENGES,
  scoreTranscript,
  todayISO,
  weeklyCompletion,
  type Attempt,
  type Progress,
  type ReviewItem,
  type ScoreResult,
} from '@atomic/domain';
import {
  loadAttempts,
  loadProgress,
  loadReviewItems,
  resetAll,
  saveAttempt,
  saveProgress,
  saveReviewItem,
  saveReviewItems,
} from '@atomic/db';
import Header from './components/Header';
import BottomNav, { type Tab } from './components/BottomNav';
import ChallengePage from './pages/ChallengePage';
import ReviewPage from './pages/ReviewPage';
import StreakPage from './pages/StreakPage';

interface Session {
  progress: Progress;
  attempts: Attempt[];
  reviewItems: ReviewItem[];
}

/** 跨天重置：若 progress.currentDate 不是今天，重置每日额度与播放计数 */
function normalizeDaily(progress: Progress, today: string): Progress {
  if (progress.currentDate === today) return progress;
  return { ...progress, currentDate: today, todayPlayCount: 0, freeTranslationsLeft: 6 };
}

export default function App() {
  const [tab, setTab] = useState<Tab>('challenge');
  const [session, setSession] = useState<Session | null>(null);
  const [transcript, setTranscript] = useState('');
  const [playCount, setPlayCount] = useState(0);
  const [submitted, setSubmitted] = useState<ScoreResult | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [key, setKey] = useState(0);
  // 提交最后一题后仍要展示判分，等用户确认才进通关页
  const [lastChallenge, setLastChallenge] = useState<typeof SEED_CHALLENGES[number] | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // 启动 / 重置后：从 IndexedDB 恢复真实状态（唯一入口）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const today = todayISO();
      let progress = await loadProgress();
      if (!progress) {
        progress = initialProgress();
        await saveProgress(progress);
      }
      progress = normalizeDaily(progress, today);
      if (progress.currentDate !== today) await saveProgress(progress);
      if (cancelled) return;
      setSession({
        progress,
        attempts: await loadAttempts(),
        reviewItems: await loadReviewItems(),
      });
    })();
    return () => { cancelled = true; };
  }, [reloadToken]);

  const updateSession = useCallback((patch: Partial<Session> | ((s: Session) => Partial<Session>)) => {
    setSession((prev) => {
      if (!prev) return prev;
      const resolved = typeof patch === 'function' ? patch(prev) : patch;
      const next = { ...prev, ...resolved };
      void saveProgress(next.progress);
      return next;
    });
  }, []);

  if (!session) {
    return <div className="app"><Header /><div className="page" /></div>;
  }

  const { progress, attempts, reviewItems } = session;
  const today = todayISO();
  const streak = currentStreak(progress.completedDates);
  const completion = weeklyCompletion(progress.completedDates);
  const nextChallenge = currentChallenge(SEED_CHALLENGES, attempts);
  // 未提交时渲染待作答的下一题；提交后锁定在刚作答的题上展示判分，
  // 直到用户点"下一题"才解锁——避免提交瞬间被切走、看不到判分与译文。
  const challenge = submitted && lastChallenge ? lastChallenge : nextChallenge;
  const course = courseProgress(SEED_CHALLENGES, attempts);

  // 全部做完且没有待确认的最后一题：展示通关态
  if (!challenge) {
    return (
      <div className="app">
        <Header />
        <div className="page">
          <div className="streak-hero">
            <div className="streak-number">{course.completed}</div>
            <div className="streak-caption">已完成 {course.total} 道挑战 · 连续 {streak} 天</div>
          </div>
          <p style={{ textAlign: 'center', color: '#8e8e93', fontSize: 14, lineHeight: 1.7 }}>
            本周完成率 {Math.round(completion * 100)}%<br />
            复习词条 {reviewItems.length} 个
          </p>
          <button
            type="button"
            className="primary-btn"
            onClick={async () => {
              await resetAll();
              setSession(null);
              setReloadToken((n) => n + 1);
              setTranscript('');
              setPlayCount(0);
              setSubmitted(null);
              setLastChallenge(null);
              setShowTranslation(false);
              setKey((n) => n + 1);
            }}
          >
            重置进度，再跑一遍
          </button>
        </div>
        <BottomNav active={tab} onChange={setTab} />
      </div>
    );
  }

  const bumpPlayCount = () => {
    updateSession((s) => ({
      progress: { ...s.progress, todayPlayCount: s.progress.todayPlayCount + 1 },
    }));
  };

  const handleSubmit = (result: ScoreResult, text: string, plays: number) => {
    setSubmitted(result);
    setLastChallenge(challenge);
    setTranscript(text);
    setPlayCount(plays);
    const attempt: Attempt = {
      challengeId: challenge.id,
      transcript: text,
      playCount: plays,
      accuracy: result.accuracy,
      createdAt: new Date().toISOString(),
    };
    void saveAttempt(attempt);
    const newItems = buildReviewItems(challenge.id, challenge.sentence, result.accuracy);
    void saveReviewItems(newItems);
    updateSession((s) => ({
      progress: {
        ...s.progress,
        completedDates: markCompleted(s.progress.completedDates, today),
      },
      attempts: [...s.attempts, attempt],
      reviewItems: mergeReviewItems(s.reviewItems, newItems),
    }));
  };

  const handleTranslate = () => {
    updateSession((s) => ({
      progress: {
        ...s.progress,
        freeTranslationsLeft: Math.max(0, s.progress.freeTranslationsLeft - 1),
      },
    }));
  };

  const handleNext = () => {
    setSubmitted(null);
    setLastChallenge(null);
    setShowTranslation(false);
    setTranscript('');
    setPlayCount(0);
    setKey((n) => n + 1);
  };

  const handlePracticeWord = (item: ReviewItem, accuracy: number) => {
    const updated = reviewItemAfterPractice(item, accuracy);
    void saveReviewItem(updated);
    updateSession((s) => ({
      reviewItems: s.reviewItems.map((r) =>
        r.word === item.word && r.sourceChallengeId === item.sourceChallengeId ? updated : r,
      ),
    }));
  };

  return (
    <div className="app">
      <Header />
      {tab === 'challenge' && (
        <ChallengePage
          key={`${key}-${challenge.id}`}
          challenge={challenge}
          streak={streak}
          initialTranscript={transcript}
          initialPlayCount={playCount}
          initialScore={submitted}
          initialShowTranslation={showTranslation}
          freeTranslationsLeft={progress.freeTranslationsLeft}
          onPlay={bumpPlayCount}
          onSubmit={handleSubmit}
          onTranslate={handleTranslate}
          onNext={handleNext}
        />
      )}
      {tab === 'streak' && (
        <StreakPage streak={streak} completion={completion} />
      )}
      {tab === 'review' && (
        <ReviewPage
          items={reviewItems}
          completion={completion}
          playCount={progress.todayPlayCount}
          onPlay={bumpPlayCount}
          onPractice={handlePracticeWord}
        />
      )}
      <BottomNav active={tab} onChange={setTab} />
    </div>
  );
}

function mergeReviewItems(existing: ReviewItem[], incoming: ReviewItem[]): ReviewItem[] {
  const map = new Map<string, ReviewItem>();
  for (const item of existing) map.set(`${item.sourceChallengeId}:${item.word}`, item);
  for (const item of incoming) map.set(`${item.sourceChallengeId}:${item.word}`, item);
  return [...map.values()].sort((a, b) => a.word.localeCompare(b.word));
}
