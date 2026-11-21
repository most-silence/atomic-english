import type { SyncSnapshot } from '@atomic/domain';

/**
 * 后端无关的同步接口。
 *
 * 纪律（framework-selection §6）：所有后端访问经 api-client，
 * Supabase / FastAPI / 平台云只是这个接口的不同实现，前端代码不感知。
 *
 * 同步语义：
 * - pull() 返回远端快照；未登录或尚无云端数据时返回 null
 * - push() 上传完整快照，由后端按 user_id 隔离存储
 * - 冲突合并由 domain.mergeSnapshots 决定，不在这个接口里
 */
export interface SyncClient {
  readonly name: string;
  pull(): Promise<SyncSnapshot | null>;
  push(snapshot: SyncSnapshot): Promise<boolean>;
}

/** 认证状态：本地优先架构下，未登录也要能用（只存本地） */
export type AuthStatus =
  | { state: 'signedOut' }
  | { state: 'signedIn'; userId: string; email: string | null };

export interface AuthClient {
  readonly name: string;
  getStatus(): Promise<AuthStatus>;
  signIn(email: string, password: string): Promise<AuthStatus>;
  signUp(email: string, password: string): Promise<AuthStatus>;
  signOut(): Promise<void>;
  onAuthChange(listener: (status: AuthStatus) => void): () => void;
}

/** 未配置后端时的空实现：保证离线优先流程照常可用 */
export const noopSyncClient: SyncClient = {
  name: 'noop',
  async pull() {
    return null;
  },
  async push() {
    return false;
  },
};

export const signedOut: AuthStatus = { state: 'signedOut' };

export const noopAuthClient: AuthClient = {
  name: 'noop',
  async getStatus() {
    return signedOut;
  },
  async signIn() {
    return signedOut;
  },
  async signUp() {
    return signedOut;
  },
  async signOut() {
    /* 无操作 */
  },
  onAuthChange() {
    return () => undefined;
  },
};
