import { useCallback, useEffect, useState } from 'react';
import {
  FREE_TRANSLATIONS_PER_DAY,
  buildWrongWordReviewItems,
  courseProgress,
  currentChallenge,
  currentStreak,
  formatCompletion,
  initialProgress,
  markCompleted,
  mergeReviewItems,
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
import PwaStatus from './components/PwaStatus';
import ChallengePage from './pages/ChallengePage';
import ReviewPage from './pages/ReviewPage';
import StreakPage from './pages/StreakPage';
import DiagnosticsPage from './pages/DiagnosticsPage';
import { MyMemoryTranslationProvider, type TranslationProvider } from '@atomic/api-client';
import { track } from './analytics';

// 翻译提供方单例：缓存命中不消耗额度，换实现只改这一处
const translationProvider: TranslationProvider = new MyMemoryTranslationProvider();
function getTranslationProvider(): TranslationProvider {
  return translationProvider;
}
import { initCloud, markDirty, onSignedInFlush, orchestrator } from './sync';
import { useViewportHeight } from './pwa/useViewportHeight';

interface Session {
  progress: Progress;
  attempts: Attempt[];
  reviewItems: ReviewItem[];
}

/** 跨天重置：若 progress.currentDate 不是今天，重置每日额度与播放计数 */
function normalizeDaily(progress: Progress, today: string): Progress {
  if (progress.currentDate === today) return progress;
  return {
    ...progress,
    currentDate: today,
    todayPlayCount: 0,
    freeTranslationsLeft: FREE_TRANSLATIONS_PER_DAY,
  };
}

export default function App() {
  // 手机浏览器：让布局跟随真实可视高度（地址栏/虚拟键盘收放）
  useViewportHeight();
  const [tab, setTab] = useState<Tab>('challenge');
  const [session, setSession] = useState<Session | null>(null);
  const [transcript, setTranscript] = useState('');
  const [playCount, setPlayCount] = useState(0);
  const [submitted, setSubmitted] = useState<ScoreResult | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);
  // 真实翻译结果（来自 TranslationProvider），不再是 seed 里的写死文案
  const [translationText, setTranslationText] = useState('');
  const [translationError, setTranslationError] = useState('');
  const [translating, setTranslating] = useState(false);
  const [key, setKey] = useState(0);
  // 提交最后一题后仍要展示判分，等用户确认才进通关页
  const [lastChallenge, setLastChallenge] = useState<typeof SEED_CHALLENGES[number] | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // 云同步初始化；只在一次同步成功后重载（syncing/error 不重载，避免打断用户）
  const [syncReload, setSyncReload] = useState(0);
  useEffect(() => {
    let prevRevision = 0;
    let unsubscribe: () => void = () => {};
    initCloud();
    onSignedInFlush();
    unsubscribe = orchestrator.subscribe((state) => {
      // 用 revision 而非 lastSyncAt：登录换设备后 pull 写库必须触发重载，
      // 即便时间戳因精度相同也不漏（lastSyncAt 相同但数据已变的情况真实存在）
      if (state.revision !== prevRevision) {
        prevRevision = state.revision;
        setSyncReload((n) => n + 1);
      }
    });
    return () => unsubscribe();
  }, []);
  useEffect(() => {
    if (syncReload === 0) return;
    let cancelled = false;
    (async () => {
      const progress = await loadProgress();
      if (cancelled || !progress) return;
      setSession({
        progress,
        attempts: await loadAttempts(),
        reviewItems: await loadReviewItems(),
      });
    })();
    return () => { cancelled = true; };
  }, [syncReload]);

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

  // 阶段二 spike 诊断页：?diag=1，不进主导航，避免污染正常用户路径
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('diag') === '1') {
    return (
      <div className="app">
        <Header />
        <PwaStatus />
        <DiagnosticsPage />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="app">
        <Header />
        <PwaStatus />
        <div className="page" />
      </div>
    );
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
        <PwaStatus />
        <div className="page">
          <div className="streak-hero">
            <div className="streak-number">{course.completed}</div>
            <div className="streak-caption">已完成 {course.total} 道挑战 · 连续 {streak} 天</div>
          </div>
          <p style={{ textAlign: 'center', color: '#8e8e93', fontSize: 14, lineHeight: 1.7 }}>
            本周完成率 {formatCompletion(completion)}<br />
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
              setTranslationText('');
              setTranslationError('');
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
    // 只入库词级判分没命中的实词；matched 与 result.targetTokens 一一对应
    const newItems = buildWrongWordReviewItems(
      challenge.id,
      challenge.sentence,
      result.matched,
    );
    void saveReviewItems(newItems);
    markDirty();
    updateSession((s) => ({
      progress: {
        ...s.progress,
        completedDates: markCompleted(s.progress.completedDates, today),
      },
      attempts: [...s.attempts, attempt],
      // 复用域层合并：已有词条按 SRS 成熟度取，不会被新错词重置复习进度
      reviewItems: mergeReviewItems(s.reviewItems, newItems),
    }));
  };

  /** 真实翻译：成功才扣额度；失败给明确提示，不白扣 */
  const handleTranslate = async () => {
    if (translationText || translating) return;
    setTranslating(true);
    setTranslationError('');
    try {
      const text = await getTranslationProvider().translate(challenge.sentence);
      setTranslationText(text);
      setShowTranslation(true);
      // 只在翻译成功后扣减——额度对应一次真实请求
      updateSession((s) => ({
        progress: {
          ...s.progress,
          freeTranslationsLeft: Math.max(0, s.progress.freeTranslationsLeft - 1),
        },
      }));
      void track('translation_success', { challengeId: challenge.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setTranslationError(message);
      void track('translation_failed', { challengeId: challenge.id, reason: message });
    } finally {
      setTranslating(false);
    }
  };

  const handleNext = () => {
    setSubmitted(null);
    setLastChallenge(null);
    setShowTranslation(false);
    setTranslationText('');
    setTranslationError('');
    setTranscript('');
    setPlayCount(0);
    setKey((n) => n + 1);
  };

  const handlePracticeWord = (item: ReviewItem, accuracy: number) => {
    const updated = reviewItemAfterPractice(item, accuracy);
    void saveReviewItem(updated);
    markDirty();
    updateSession((s) => ({
      reviewItems: s.reviewItems.map((r) =>
        r.word === item.word && r.sourceChallengeId === item.sourceChallengeId ? updated : r,
      ),
    }));
  };

  return (
    <div className="app">
      <Header />
      <PwaStatus />
      {tab === 'challenge' && (
        <ChallengePage
          key={`${key}-${challenge.id}`}
          challenge={challenge}
          streak={streak}
          initialTranscript={transcript}
          initialPlayCount={playCount}
          initialScore={submitted}
          initialShowTranslation={showTranslation}
          translationText={translationText}
          translationError={translationError}
          translating={translating}
          freeTranslationsLeft={progress.freeTranslationsLeft}
          onPlay={bumpPlayCount}
          onSubmit={handleSubmit}
          onTranslate={() => { void handleTranslate(); }}
          onNext={handleNext}
        />
      )}
      {tab === 'streak' && (
        <StreakPage
          streak={streak}
          completion={completion}
          currentChallengeId={nextChallenge?.id ?? null}
          totalChallenges={SEED_CHALLENGES.length}
        />
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
