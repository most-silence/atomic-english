/**
 * 同步编排器：把本地 Dexie 与远端 SyncClient 连起来。
 *
 * 触发时机：
 *  1. 登录成功 / 用户切换 → 立即 pull + 合并 + push
 *  2. 本地数据变化（提交作答、推进复习、进度更新）→ 标记 dirty，延迟 push
 *  3. 网络恢复 → 若有 dirty 则 push
 *  4. 退出登录 → 停止同步（本地数据保留）
 *
 * 纪律：离线优先——同步失败只记日志、保留 dirty 标记，绝不阻塞本地操作。
 */
import { mergeSnapshots } from '@atomic/domain';
import {
  noopSyncClient,
  type AuthClient,
  type AuthStatus,
  type SyncClient,
} from '@atomic/api-client';
import { applySnapshot, exportSnapshot } from '@atomic/db';

export interface SyncState {
  status: 'idle' | 'syncing' | 'error' | 'disabled';
  lastSyncAt: string | null;
  dirty: boolean;
  error: string | null;
}

type Listener = (state: SyncState) => void;

export class SyncOrchestrator {
  private syncClient: SyncClient = noopSyncClient;
  private authClient: AuthClient | null = null;
  private auth: AuthStatus = { state: 'signedOut' };
  private state: SyncState = {
    status: 'disabled',
    lastSyncAt: null,
    dirty: false,
    error: null,
  };
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  getState(): SyncState {
    return { ...this.state };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private emit() {
    for (const l of this.listeners) l(this.getState());
  }

  private setState(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  /** 接入真实的认证与同步实现；未调用时同步处于 disabled，本地流程照常 */
  configure(authClient: AuthClient, syncClient: SyncClient): void {
    this.authClient = authClient;
    this.syncClient = syncClient;
    void authClient.getStatus().then((status) => this.onAuthChange(status));
    authClient.onAuthChange((status) => this.onAuthChange(status));

    window.addEventListener('online', () => {
      if (this.state.dirty && this.auth.state === 'signedIn') void this.syncNow();
    });
  }

  private onAuthChange(status: AuthStatus): void {
    const switched = this.auth.state === 'signedIn' && status.state === 'signedIn'
      ? this.auth.userId !== status.userId
      : this.auth.state !== status.state;
    this.auth = status;

    if (status.state !== 'signedIn') {
      this.setState({ status: 'disabled', dirty: false, error: null });
      if (this.timer) clearTimeout(this.timer);
      return;
    }

    this.setState({ status: 'idle', error: null });
    // 用户切换必须全量重新 pull，否则会把 A 的未推数据合进 B
    if (switched) void this.syncNow(true);
  }

  /** 本地数据变化后调用：延迟 2 秒合并推送，避免每次输入都发请求 */
  markDirty(): void {
    if (this.auth.state !== 'signedIn') return;
    this.setState({ dirty: true });
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.syncNow(), 2000);
  }

  /**
   * 执行一次同步。forcePull=true 时无条件拉取（用户切换后用）。
   * 合并规则在 domain.mergeSnapshots：本地是真相源，云端只补充缺失数据。
   */
  async syncNow(forcePull = false): Promise<void> {
    if (this.running || this.auth.state !== 'signedIn') return;
    this.running = true;
    this.setState({ status: 'syncing', error: null });

    try {
      const local = await exportSnapshot();

      if (forcePull || !this.state.dirty) {
        const remote = await this.syncClient.pull();
        if (remote) {
          const merged = mergeSnapshots(local, remote);
          // 只有远端确实带来新数据才写本地，避免无意义写入
          await applySnapshot(merged);
        }
      }

      const latest = await exportSnapshot();
      const ok = await this.syncClient.push(latest);
      this.setState({
        status: ok ? 'idle' : 'error',
        error: ok ? null : '云端同步失败，数据已保留在本机',
        dirty: !ok,
        lastSyncAt: ok ? new Date().toISOString() : this.state.lastSyncAt,
      });
    } catch (err) {
      this.setState({
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
        dirty: true,
      });
    } finally {
      this.running = false;
    }
  }
}
