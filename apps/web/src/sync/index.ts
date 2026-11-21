import { useEffect, useState } from 'react';
import {
  noopAuthClient,
  noopSyncClient,
  SupabaseAuthClient,
  SupabaseSyncClient,
  type AuthClient,
  type AuthStatus,
  type SyncClient,
} from '@atomic/api-client';
import { SyncOrchestrator } from './orchestrator';

/**
 * 云同步接入点。
 * 未配置 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 时用 noop 实现——
 * 本地优先架构下 app 完全可用，只是不同步（这正是离线优先的意义）。
 */
let authClient: AuthClient = noopAuthClient;
let syncClient: SyncClient = noopSyncClient;
export const configured = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
);

export const orchestrator = new SyncOrchestrator();

export function initCloud(): void {
  if (!configured) return;
  const config = {
    url: import.meta.env.VITE_SUPABASE_URL,
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  };
  authClient = new SupabaseAuthClient(config);
  syncClient = new SupabaseSyncClient(config);
  orchestrator.configure(authClient, syncClient);
}

export function getAuthClient(): AuthClient {
  return authClient;
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
