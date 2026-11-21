/** 所有后端 HTTP 请求的统一超时，避免弱网下请求永久 pending。 */
export const NETWORK_TIMEOUT_MS = 10_000;

export function fetchWithTimeout(url: string | URL, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS) });
}
