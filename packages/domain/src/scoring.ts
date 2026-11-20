/**
 * 判分算法——由截图反推（见 docs/research/atomic-learning-reverse.md §2.3）：
 * 原句 `I have started surfing again after years off.`（8 词） vs 输入 `I start`（2 词）
 * 得 12.50% = 1/8，只有 `I` 精确命中，`start ≠ started`。
 * 故：正确率 = 精确匹配的词数 / 原句词数；不做词干归一，形态变化算错。
 */

/** 提取原始 token（保留大小写、去掉外围标点），用于展示 */
export function displayTokens(sentence: string): string[] {
  return sentence.split(/\s+/)
    .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean);
}

export function tokenize(sentence: string): string[] {
  return displayTokens(sentence).map((token) => token.toLowerCase());
}

export interface ScoreResult {
  accuracy: number;
  correctCount: number;
  totalCount: number;
  /** 逐词命中标记，与原句 token 一一对应，供逐词高亮 UI 使用 */
  matched: boolean[];
  /** 用户每个 token 是否命中，与输入 token 一一对应 */
  userMatched: boolean[];
  userTokens: string[];
  /** 归一化（小写）后的 token，用于判分 */
  targetTokens: string[];
  /** 原句中的原始 token（保留大小写与标点），用于逐词高亮展示 */
  displayTokens: string[];
}

/**
 * 精确匹配判分：用 multiset 计数，避免重复词被重复命中。
 * 命中数 / 原句总词数 = 正确率（0–1）。
 */
export function scoreTranscript(transcript: string, sentence: string): ScoreResult {
  const targetTokens = tokenize(sentence);
  const userTokens = tokenize(transcript);
  const remaining = new Map<string, number>();
  for (const token of targetTokens) {
    remaining.set(token, (remaining.get(token) ?? 0) + 1);
  }

  const userMatched = userTokens.map((token) => {
    const count = remaining.get(token) ?? 0;
    if (count > 0) {
      remaining.set(token, count - 1);
      return true;
    }
    return false;
  });

  const matched = new Array<boolean>(targetTokens.length).fill(false);
  const consume = new Map<string, number>();
  for (const token of userTokens) {
    const used = consume.get(token) ?? 0;
    if (used >= targetTokens.filter((t) => t === token).length) continue;
    const idx = targetTokens.findIndex((t, i) => t === token && !matched[i]);
    if (idx >= 0) {
      matched[idx] = true;
      consume.set(token, used + 1);
    }
  }

  const correctCount = matched.filter(Boolean).length;
  const totalCount = targetTokens.length;
  return {
    accuracy: totalCount === 0 ? 0 : correctCount / totalCount,
    correctCount,
    totalCount,
    matched,
    userMatched,
    userTokens,
    targetTokens,
    displayTokens: displayTokens(sentence),
  };
}

export function formatAccuracy(accuracy: number): string {
  return `${(accuracy * 100).toFixed(2)}%`;
}
