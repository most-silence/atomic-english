import { useEffect, useMemo, useRef, useState } from 'react';
import {
  formatAccuracy,
  formatDateCN,
  scoreTranscript,
  type Challenge,
  type ScoreResult,
} from '@atomic/domain';
import { speak, unlockAudio, type PlaybackHandle } from '@atomic/audio';

const DIFFICULTY_LABEL: Record<Challenge['difficulty'], string> = {
  easy: '简单',
  normal: '普通',
  hard: '困难',
};

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function ChallengePage({
  challenge,
  streak,
  initialTranscript,
  initialPlayCount,
  initialScore,
  initialShowTranslation,
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
  /** 演示态：截图 B 即已提交状态，首屏直接呈现它 */
  initialScore: ScoreResult | null;
  initialShowTranslation: boolean;
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
  const [elapsed, setElapsed] = useState(0);
  const handleRef = useRef<PlaybackHandle | null>(null);
  const timerRef = useRef<number | null>(null);

  const totalSec = challenge.audioDurationMs / 1000;

  const play = () => {
    // iOS 上 speak() 必须在用户手势的同步调用栈内；保活音轨也在这里启动。
    unlockAudio();
    handleRef.current?.stop();
    const handle = speak(challenge.sentence, 'en-US');
    handleRef.current = handle;
    setPlaying(true);
    setElapsed(0);
    setPlayCount((n) => {
      const next = n + 1;
      onPlay();
      return next;
    });

    if (timerRef.current) window.clearInterval(timerRef.current);
    const started = Date.now();
    timerRef.current = window.setInterval(() => {
      const e = Math.min(totalSec, (Date.now() - started) / 1000);
      setElapsed(e);
      if (e >= totalSec) {
        if (timerRef.current) window.clearInterval(timerRef.current);
        timerRef.current = null;
        setPlaying(false);
      }
    }, 100);
    handle.done.finally(() => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      setElapsed(totalSec);
      setPlaying(false);
    });
  };

  useEffect(() => () => {
    handleRef.current?.stop();
    if (timerRef.current) window.clearInterval(timerRef.current);
  }, []);

  const submit = () => {
    if (submitted) { onNext(); return; }
    const result = scoreTranscript(transcript, challenge.sentence);
    setSubmitted(result);
    onSubmit(result, transcript, playCount);
  };

  const translate = () => {
    if (showTranslation || freeTranslationsLeft <= 0) return;
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
        <time>{fmtTime(elapsed)} / {fmtTime(totalSec)}</time>
        <span className="track"><i style={{ width: `${(elapsed / totalSec) * 100}%` }} /></span>
      </div>

      <div className="metrics">
        <div>
          <div className="metric-value">{DIFFICULTY_LABEL[challenge.difficulty]}</div>
          <div className="metric-label">难度</div>
        </div>
        <div>
          <div className="metric-value">{playCount}</div>
          <div className="metric-label">播放次数</div>
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

      <button type="button" className="translate-bar" onClick={translate}>
        <span aria-hidden>文A</span>
        <span>简体中文</span>
        <span className="caret">⌄</span>
      </button>
      <p className="translate-hint">还剩 {freeTranslationsLeft} 次免费翻译</p>

      {submitted ? (
        <p className="sentence"><span className="cursor" />{highlighted}</p>
      ) : (
        <p className="sentence" style={{ color: '#c7c7cc' }}>
          <span className="cursor" style={{ borderColor: '#c7c7cc' }} />
          提交后显示正确答案
        </p>
      )}

      {showTranslation && <p className="translation">{challenge.translation}</p>}

      <button type="button" className="primary-btn" onClick={submit}>
        {submitted ? '下一题' : '提交'}
      </button>
    </div>
  );
}
