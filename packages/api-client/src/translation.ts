/**
 * 翻译提供方接口。
 * 与 AuthClient / SyncClient 同一纪律：具体实现收敛在 api-client，前端只见接口。
 */
export interface TranslationProvider {
  readonly name: string;
  /**
   * 翻译一段英文到简体中文。
   * 失败时抛错，调用方不得扣减额度——这是"额度对应真实请求"的核心约束。
   */
  translate(text: string, from?: string, to?: string): Promise<string>;
}

/**
 * MyMemory 免费公共翻译接口。
 *
 * 实测（2026-11-21）：GET https://api.mymemory.translated.net/get?q=...&langpair=en|zh-CN
 * 返回 { responseData: { translatedText, match }, responseStatus: 200, quotaFinished: false }
 * 无需密钥，有匿名配额与字符上限。
 *
 * 风险：这是免费公共服务，大陆可达性与配额不保证；失败时前端明确提示，
 * 不假装成功、不白扣额度。若将来要稳定商用，换实现即可（LLM / 有道 / DeepL）。
 */
export class MyMemoryTranslationProvider implements TranslationProvider {
  readonly name = 'mymemory';
  private endpoint = 'https://api.mymemory.translated.net/get';
  private cache = new Map<string, string>();

  async translate(text: string, from = 'en', to = 'zh-CN'): Promise<string> {
    const key = `${from}|${to}|${text}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const url = new URL(this.endpoint);
    url.searchParams.set('q', text);
    url.searchParams.set('langpair', `${from}|${to}`);

    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    } catch (err) {
      throw new Error(`翻译服务不可达：${err instanceof Error ? err.message : String(err)}`);
    }
    if (!response.ok) throw new Error(`翻译服务返回 ${response.status}`);

    const data = (await response.json()) as {
      responseData?: { translatedText?: string };
      responseStatus?: number;
      quotaFinished?: boolean;
      responseDetails?: string;
    };

    if (data.quotaFinished) throw new Error('翻译服务今日配额已用完');
    const translated = data.responseData?.translatedText;
    if (!translated || data.responseStatus !== 200) {
      throw new Error(data.responseDetails || '翻译服务未返回有效结果');
    }

    this.cache.set(key, translated);
    return translated;
  }
}
