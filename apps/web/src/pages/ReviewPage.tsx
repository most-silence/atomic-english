import { useEffect, useRef, useState } from 'react';
import { scoreWord, srsTierFor, dueReviewItems, type ReviewItem } from '@atomic/domain';
import { speak, unlockAudio } from '@atomic/audio';
import { track } from '../analytics';
import WeekStats from '../components/WeekStats';

/**
 * 复习页：词级听写闭环。
 *
 * 点词条 → 播放发音 → 用户输入拼写 → 按词级判分 → 驱动 SRS。
 * 不再有「全部记住了」一键放行——那是绕过学习本身的假交互。
 */
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

  // 当前正在听写的词；null 表示列表态
  const [active, setActive] = useState<ReviewItem | null>(null);
  const [input, setInput] = useState('');
  const [result, setResult] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // 词条列表变化时，如果当前词已不在待复习里就退出。
  // 但**已判分后不能自动退出**：判分会立刻把词条排到明天，
  // 若在这里弹回词表，用户就来不及看到「正确/正确答案」的反馈。
  useEffect(() => {
    if (active && result === null && !due.some((r) => r.word === active.word && r.sourceChallengeId === active.sourceChallengeId)) {
      setActive(null);
      setResult(null);
    }
  }, [due, active, result]);

  const playWord = (word: string) => {
    const unlocked = unlockAudio();
    void track('audio_unlock', { word, source: 'review', ...unlocked });
    speak(word, 'en-US');
    onPlay();
  };

  const start = (item: ReviewItem) => {
    setActive(item);
    setInput('');
    setResult(null);
    playWord(item.word);
    // 自动聚焦省一次点击；preventScroll 避免 iOS 弹键盘时页面跳动遮挡提交按钮
    setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 0);
  };

  const submit = () => {
    if (!active || result !== null) return;
    const accuracy = scoreWord(input, active.word);
    setResult(accuracy);
    void track('review_word_graded', {
      word: active.word,
      accuracy,
      reviewedCount: active.reviewedCount,
    });
    onPractice(active, accuracy);
  };

  const next = () => {
    setActive(null);
    setInput('');
    setResult(null);
  };

  return (
    <div className="page">
      <WeekStats completion={completion} playCount={playCount} />
      <div className="review-summary">
        待复习 {due.length} / 共 {items.length} 个词条
      </div>

      {active ? (
        <div className="review-drill" data-testid="review-drill">
          <p className="review-drill-hint">听发音，拼出这个单词</p>
          <button type="button" className="review-replay" onClick={() => playWord(active.word)}>
            <span className="play" aria-hidden />
            再听一遍
          </button>
          <input
            ref={inputRef}
            className="transcript-input review-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            disabled={result !== null}
            placeholder="拼写你听到的单词"
            aria-label="单词听写输入"
            data-testid="review-input"
          />
          {result === null ? (
            <button type="button" className="primary-btn" onClick={submit} data-testid="review-submit">
              提交
            </button>
          ) : (
            <div className="review-feedback" data-testid="review-feedback">
              <p className={result === 1 ? 'review-correct' : 'review-wrong'}>
                {result === 1 ? '正确' : `正确答案：${active.word}`}
              </p>
              <p className="review-srs">{srsTierFor(result).label}</p>
              <button type="button" className="primary-btn" onClick={next} data-testid="review-next">
                下一个
              </button>
            </div>
          )}
          <button type="button" className="review-exit" onClick={next}>
            返回词表
          </button>
        </div>
      ) : (
        <>
          <p className="review-hint-desc">点选词条，听写后按表现安排下次复习</p>
          <div className="words">
            {words.map((item) => (
              <button
                type="button"
                className="word-pill"
                key={`${item.sourceChallengeId}:${item.word}`}
                onClick={() => start(item)}
                data-testid="word-pill"
              >
                <span>{item.word}</span>
                <span className="play" aria-hidden />
              </button>
            ))}
          </div>
          {items.length === 0 && (
            <p className="review-empty">完成挑战后，错词会出现在这里。</p>
          )}
          {items.length > 0 && words.length === 0 && (
            <p className="review-empty">今天的词都复习完了，明天再来。</p>
          )}
        </>
      )}
    </div>
  );
}
