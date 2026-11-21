import { useEffect, useState } from 'react';
import {
  noopAuthClient,
  noopSyncClient,
  SupabaseAnalyticsSink,
  SupabaseAuthClient,
  SupabaseSyncClient,
  type AuthClient,
  type AuthStatus,
  type SyncClient,
} from '@atomic/api-client';
import { flushEvents, setAnalyticsSink } from '../analytics';
import { getRuntimeConfig } from '../config';
import { SyncOrchestrator } from './orchestrator';

/**
 * 云同步接入点。
 * 未配置 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 时用 noop 实现——
 * 本地优先架构下 app 完全可用，只是不同步（这正是离线优先的意义）。
 */
let authClient: AuthClient = noopAuthClient;
let syncClient: SyncClient = noopSyncClient;
const runtimeConfig = getRuntimeConfig();
export const configured = runtimeConfig !== null;

export const orchestrator = new SyncOrchestrator();

export function initCloud(): void {
  if (!runtimeConfig) return;
  const config = {
    url: runtimeConfig.supabaseUrl,
    anonKey: runtimeConfig.supabaseAnonKey,
  };
  authClient = new SupabaseAuthClient(config);
  syncClient = new SupabaseSyncClient(config);
  // 埋点走同一后端；未登录时 sink 返回 false，事件留在本地队列
  setAnalyticsSink(new SupabaseAnalyticsSink(config));
  orchestrator.configure(authClient, syncClient);
}

export function getAuthClient(): AuthClient {
  return authClient;
}

/**
 * 登录态变化时立即冲刷埋点队列。
 * 安装漏斗事件发生在登录之前（未登录时 sink 返回 false、留在本地），
 * 登录后必须主动上报，否则要等下一个 60 秒定时器。
 */
export function onSignedInFlush(): void {
  if (!configured) return;
  getAuthClient().onAuthChange((status) => {
    if (status.state === 'signedIn') void flushEvents();
  });
}

export function useAuthStatus(): AuthStatus {
  const [status, setStatus] = useState<AuthStatus>({ state: 'signedOut' });
  useEffect(() => authClient.onAuthChange(setStatus), []);
  return status;
}

/** 本地数据变化后通知同步器（延迟批量上传） */
export function markDirty(): void {
  orchestrator.markDirty();
}
