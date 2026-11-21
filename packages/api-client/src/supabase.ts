import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AnalyticsEvent } from '@atomic/db';
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

/** 远端行 → 领域对象 */
function rowToProgress(row: Record<string, unknown> | null) {
  if (!row) return null;
  return {
    completedDates: (row.completed_dates as string[]) ?? [],
    todayPlayCount: (row.today_play_count as number) ?? 0,
    freeTranslationsLeft: (row.free_translations_left as number) ?? 6,
    currentDate: (row.active_date as string) ?? '',
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
        challengeId: r.challenge_id as number,
        transcript: r.transcript as string,
        playCount: (r.play_count as number) ?? 0,
        accuracy: (r.accuracy as number) ?? 0,
        createdAt: r.created_at as string,
      })),
      reviewItems: (reviews.data ?? []).map((r) => ({
        sourceChallengeId: r.source_challenge_id as number,
        word: r.word as string,
        nextReviewAt: r.next_review_at as string,
        lastAccuracy: (r.last_accuracy as number) ?? 0,
        reviewedCount: (r.reviewed_count as number) ?? 0,
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
