import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AnalyticsEvent } from '@atomic/db';
import { FREE_TRANSLATIONS_PER_DAY } from '@atomic/domain';
import type { SyncSnapshot } from '@atomic/domain';
import type { AnalyticsSink } from './index';
import type { AuthClient, AuthStatus, SyncClient } from './sync';

/**
 * Supabase 实现——所有 Supabase 代码只出现在本文件（framework-selection §6 的纪律）。
 * 前端只见 SyncClient / AuthClient 接口，换后端时不动业务代码。
 *
 * 本地栈凭据由 supabase start 输出；生产走环境变量 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY。
 */

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

/**
 * 共享同一个 SupabaseClient。
 * supabase-js 每个实例都会创建一个 GoTrueClient 并注册 auth 监听器，
 * 多个实例会导致 "Multiple GoTrueClient instances" 警告与 token 刷新竞争。
 */
const clientCache = new Map<string, SupabaseClient>();

function makeClient(config: SupabaseConfig): SupabaseClient {
  const key = `${config.url}|${config.anonKey}`;
  const cached = clientCache.get(key);
  if (cached) return cached;
  const client = createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  clientCache.set(key, client);
  return client;
}

/** 把 supabase 用户转成与后端无关的身份 */
function toAuthStatus(user: { id: string; email?: string } | null): AuthStatus {
  return user
    ? { state: 'signedIn', userId: user.id, email: user.email ?? null }
    : { state: 'signedOut' };
}

export class SupabaseAuthClient implements AuthClient {
  readonly name = 'supabase';
  private client: SupabaseClient;

  constructor(config: SupabaseConfig) {
    this.client = makeClient(config);
  }

  async getStatus(): Promise<AuthStatus> {
    const { data } = await this.client.auth.getUser();
    return toAuthStatus(data.user);
  }

  async signIn(email: string, password: string): Promise<AuthStatus> {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return toAuthStatus(data.user);
  }

  async signUp(email: string, password: string): Promise<AuthStatus> {
    const { data, error } = await this.client.auth.signUp({ email, password });
    if (error) throw error;
    // 本地栈默认关闭邮箱确认，直接就是登录态
    return toAuthStatus(data.user);
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) throw error;
  }

  onAuthChange(listener: (status: AuthStatus) => void): () => void {
    const { data } = this.client.auth.onAuthStateChange((_event, session) => {
      listener(toAuthStatus(session?.user ?? null));
    });
    return () => data.subscription.unsubscribe();
  }
}

/**
 * 远端行的 runtime 校验。
 * 本地 Dexie 是真相源，脏数据一旦写进去很难恢复，所以宁可抛错让 orchestrator
 * 进 error 态、保留本地数据，也不能用 `as` 把云端脏值悄悄灌进来。
 */
function requireNumber(value: unknown, field: string, fallback?: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (fallback !== undefined && (value === null || value === undefined)) return fallback;
  throw new Error(`云端字段 ${field} 类型异常：${String(value)}`);
}

function requireString(value: unknown, field: string, fallback?: string): string {
  if (typeof value === 'string') return value;
  if (fallback !== undefined && (value === null || value === undefined)) return fallback;
  throw new Error(`云端字段 ${field} 类型异常：${String(value)}`);
}

/** 远端行 → 领域对象 */
function rowToProgress(row: Record<string, unknown> | null) {
  if (!row) return null;
  const dates = row.completed_dates;
  if (dates != null && !Array.isArray(dates)) {
    throw new Error(`云端字段 completed_dates 类型异常：${String(dates)}`);
  }
  return {
    completedDates: (dates ?? []) as string[],
    todayPlayCount: requireNumber(row.today_play_count, 'today_play_count', 0),
    freeTranslationsLeft: requireNumber(
      row.free_translations_left,
      'free_translations_left',
      FREE_TRANSLATIONS_PER_DAY,
    ),
    currentDate: requireString(row.active_date, 'active_date', ''),
  };
}

export class SupabaseSyncClient implements SyncClient {
  readonly name = 'supabase';
  private client: SupabaseClient;

  constructor(config: SupabaseConfig) {
    this.client = makeClient(config);
  }

  async pull(): Promise<SyncSnapshot | null> {
    const { data: auth } = await this.client.auth.getUser();
    if (!auth.user) return null;

    const [progress, attempts, reviews] = await Promise.all([
      this.client.from('progress').select('*').eq('user_id', auth.user.id).maybeSingle(),
      this.client.from('attempts').select('*').eq('user_id', auth.user.id),
      this.client.from('review_items').select('*').eq('user_id', auth.user.id),
    ]);

    if (progress.error) throw progress.error;
    if (attempts.error) throw attempts.error;
    if (reviews.error) throw reviews.error;

    return {
      progress: rowToProgress(progress.data),
      attempts: (attempts.data ?? []).map((r) => ({
        challengeId: requireNumber(r.challenge_id, 'challenge_id'),
        transcript: requireString(r.transcript, 'transcript'),
        playCount: requireNumber(r.play_count, 'play_count', 0),
        accuracy: requireNumber(r.accuracy, 'accuracy', 0),
        createdAt: requireString(r.created_at, 'created_at'),
      })),
      reviewItems: (reviews.data ?? []).map((r) => ({
        sourceChallengeId: requireNumber(r.source_challenge_id, 'source_challenge_id'),
        word: requireString(r.word, 'word'),
        nextReviewAt: requireString(r.next_review_at, 'next_review_at'),
        lastAccuracy: requireNumber(r.last_accuracy, 'last_accuracy', 0),
        reviewedCount: requireNumber(r.reviewed_count, 'reviewed_count', 0),
      })),
    };
  }

  async push(snapshot: SyncSnapshot): Promise<boolean> {
    const { data: auth } = await this.client.auth.getUser();
    if (!auth.user) return false;
    const userId = auth.user.id;

    if (snapshot.progress) {
      const { error } = await this.client.from('progress').upsert({
        user_id: userId,
        completed_dates: snapshot.progress.completedDates,
        today_play_count: snapshot.progress.todayPlayCount,
        free_translations_left: snapshot.progress.freeTranslationsLeft,
        active_date: snapshot.progress.currentDate,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    }

    if (snapshot.attempts.length) {
      const { error } = await this.client.from('attempts').upsert(
        snapshot.attempts.map((a) => ({
          user_id: userId,
          challenge_id: a.challengeId,
          transcript: a.transcript,
          play_count: a.playCount,
          accuracy: a.accuracy,
          created_at: a.createdAt,
        })),
        { onConflict: 'user_id,challenge_id,created_at', ignoreDuplicates: true },
      );
      if (error) throw error;
    }

    if (snapshot.reviewItems.length) {
      const { error } = await this.client.from('review_items').upsert(
        snapshot.reviewItems.map((r) => ({
          user_id: userId,
          source_challenge_id: r.sourceChallengeId,
          word: r.word,
          next_review_at: r.nextReviewAt,
          last_accuracy: r.lastAccuracy,
          reviewed_count: r.reviewedCount,
          updated_at: new Date().toISOString(),
        })),
      );
      if (error) throw error;
    }

    return true;
  }
}

/**
 * 埋点上报到 Supabase analytics_events 表。
 *
 * RLS 按 auth.uid() 隔离，所以未登录时 send() 返回 false——
 * 事件留在本地 IndexedDB 队列里，等登录后下次 flush 再上报，不丢数据。
 * 这与"本地优先"的纪律一致：埋点不能成为阻塞学习的前提。
 */
export class SupabaseAnalyticsSink implements AnalyticsSink {
  readonly name = 'supabase';
  private client: SupabaseClient;

  constructor(config: SupabaseConfig) {
    this.client = makeClient(config);
  }

  async send(events: AnalyticsEvent[]): Promise<boolean> {
    const { data: auth } = await this.client.auth.getUser();
    if (!auth.user) return false; // 未登录：保留队列，等待下次

    const { error } = await this.client.from('analytics_events').insert(
      events.map((e) => ({
        user_id: auth.user.id,
        name: e.name,
        payload: e.payload ?? {},
        created_at: e.createdAt,
      })),
    );
    return !error;
  }
}
