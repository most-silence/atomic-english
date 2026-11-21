/**
 * 判分算法——由截图反推（见 docs/research/reference-behavior-notes.md §2.3）：
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

  const matched = new Array<boolean>(targetTokens.length).fill(false);
  // 为每个 token 预先建立原句中未匹配位置的队列，用户 token 按顺序出队即可，
  // 避免旧实现在循环内反复 filter/findIndex 的 O(n²)。
  const slots = new Map<string, number[]>();
  targetTokens.forEach((token, index) => {
    const queue = slots.get(token) ?? [];
    queue.push(index);
    slots.set(token, queue);
  });
  const userMatched = userTokens.map((token) => {
    const queue = slots.get(token);
    const index = queue?.shift();
    if (index === undefined) return false;
    matched[index] = true;
    return true;
  });

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
