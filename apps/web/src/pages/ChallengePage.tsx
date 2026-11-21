import { useEffect, useMemo, useRef, useState } from 'react';
import {
  formatAccuracy,
  formatDateCN,
  scoreTranscript,
  type Challenge,
  type ScoreResult,
} from '@atomic/domain';
import { speak, unlockAudio, type PlaybackHandle } from '@atomic/audio';
import { track } from '../analytics';

const DIFFICULTY_LABEL: Record<Challenge['difficulty'], string> = {
  easy: '简单',
  normal: '普通',
  hard: '困难',
};

export default function ChallengePage({
  challenge,
  streak,
  initialTranscript,
  initialPlayCount,
  initialScore,
  initialShowTranslation,
  translationText,
  translationError,
  translating,
  freeTranslationsLeft,
  onPlay,
  onSubmit,
  onTranslate,
  onNext,
}: {
  challenge: Challenge;
  streak: number;
  initialTranscript: string;
  initialPlayCount: number;
  /** 已提交的判分结果；非 null 时锁定在本题展示判分与译文 */
  initialScore: ScoreResult | null;
  initialShowTranslation: boolean;
  /** 真实翻译结果（来自 TranslationProvider），不再从 seed 读 */
  translationText: string;
  translationError: string;
  translating: boolean;
  freeTranslationsLeft: number;
  onPlay: () => void;
  onSubmit: (result: ScoreResult, transcript: string, playCount: number) => void;
  onTranslate: () => void;
  onNext: () => void;
}) {
  const [transcript, setTranscript] = useState(initialTranscript);
  const [playCount, setPlayCount] = useState(initialPlayCount);
  const [submitted, setSubmitted] = useState<ScoreResult | null>(initialScore);
  const [showTranslation, setShowTranslation] = useState(initialShowTranslation);
  const [playing, setPlaying] = useState(false);
  const handleRef = useRef<PlaybackHandle | null>(null);

  // Web Speech API 不提供可靠的播放时长/进度事件。
  // 旧实现用 seed 里写死的 audioDurationMs + Date.now() 假装进度条，那是假的。
  // 现在改为「播放中」的 indeterminate 动画，诚实地表达状态。
  const play = () => {
    // iOS 上 speak() 必须在用户手势的同步调用栈内；保活音轨也在这里启动。
    const unlocked = unlockAudio();
    void track('audio_unlock', {
      speechStarted: unlocked.speechStarted,
      keepAliveStarted: unlocked.keepAliveStarted,
      challengeId: challenge.id,
    });
    handleRef.current?.stop();
    const handle = speak(challenge.sentence, 'en-US');
    handleRef.current = handle;
    setPlaying(true);
    setPlayCount((n) => {
      const next = n + 1;
      onPlay();
      return next;
    });

    // 播放结束由 TTS 的真实 onend / watchdog 决定，不再用假定时器
    void handle.done.finally(() => setPlaying(false));
  };

  useEffect(() => () => {
    handleRef.current?.stop();
  }, []);

  const submit = () => {
    if (submitted) { onNext(); return; }
    const result = scoreTranscript(transcript, challenge.sentence);
    setSubmitted(result);
    onSubmit(result, transcript, playCount);
  };

  const translate = () => {
    if (showTranslation || translating || freeTranslationsLeft <= 0) return;
    setShowTranslation(true);
    onTranslate();
  };

  const highlighted = useMemo(() => {
    if (!submitted) return null;
    return submitted.displayTokens.map((token, i) => {
      const isLast = i === submitted.displayTokens.length - 1;
      return (
        <span key={`${token}-${i}`} className={submitted.matched[i] ? 'hit' : 'miss'}>
          {token}{isLast ? '.' : ' '}
        </span>
      );
    });
  }, [submitted]);

  return (
    <div className="page">
      <p className="challenge-meta">
        {formatDateCN(challenge.date)} #{challenge.id} · 连续天数 {streak}
      </p>

      <div className="player">
        <button
          type="button"
          className={`play-btn ${playing ? 'playing' : ''}`}
          onClick={play}
          aria-label={playing ? '停止' : '播放'}
        >
          <span className="tri" />
        </button>
        <time>{playing ? '播放中' : '点击播放'}</time>
        <span className={`track ${playing ? 'indeterminate' : ''}`}>
          <i />
        </span>
      </div>

      <div className="metrics">
        <div>
          <div className="metric-value">{DIFFICULTY_LABEL[challenge.difficulty]}</div>
          <div className="metric-label">难度</div>
        </div>
        <div>
          <div className="metric-value">{playCount}</div>
          <div className="metric-label">本题播放</div>
        </div>
        <div>
          <div className="metric-value">{submitted ? formatAccuracy(submitted.accuracy) : '—'}</div>
          <div className="metric-label">正确率</div>
        </div>
      </div>

      <input
        className="transcript-input"
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        placeholder="听写你听到的内容"
        disabled={!!submitted}
        aria-label="听写输入"
      />

      <div className="divider" />

      <button type="button" className="translate-bar" onClick={translate} data-testid="translate-bar">
        <span aria-hidden>文A</span>
        <span>{translating ? '翻译中…' : '简体中文'}</span>
        <span className="caret">⌄</span>
      </button>
      <p className="translate-hint">
        {translationError ? (
          <span className="translate-error" data-testid="translate-error">{translationError}</span>
        ) : (
          `还剩 ${freeTranslationsLeft} 次免费翻译`
        )}
      </p>

      {submitted ? (
        <p className="sentence"><span className="cursor" />{highlighted}</p>
      ) : (
        <p className="sentence" style={{ color: '#c7c7cc' }}>
          <span className="cursor" style={{ borderColor: '#c7c7cc' }} />
          提交后显示正确答案
        </p>
      )}

      {showTranslation && translationText && (
        <p className="translation" data-testid="translation">{translationText}</p>
      )}

      <button type="button" className="primary-btn" onClick={submit}>
        {submitted ? '下一题' : '提交'}
      </button>
    </div>
  );
}
