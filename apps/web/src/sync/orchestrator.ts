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
  /** 每次成功同步（含 applySnapshot 写库）后递增，UI 据此重载本地数据 */
  revision: number;
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
    revision: 0,
  };
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  /**
   * 订阅流是否已经给出过状态。
   * configure() 里的 getStatus() 走网络、是慢异步；若它迟到的结果（往往是页面加载时的
   * signedOut）覆盖掉登录事件刚设好的 signedIn，会让 syncNow 在「非登录态」门口直接返回，
   * 表现为登录后 UI 显示 idle 却永远拉不回云端进度。故一旦订阅流来过，就忽略迟到的初始化结果。
   */
  private authStreamSeen = false;
  /**
   * 登录/切换后置位：下一次实际执行的 syncNow 必须无条件 pull。
   * 解决竞态：登录回调触发的 syncNow(true) 可能被同时在跑的 syncNow 用 running 标志吞掉，
   * 或被迟到的 auth 状态挡在门口；之后 dirty 定时器触发的 syncNow 若因 dirty 跳过 pull，
   * 就会把本地空快照 push 上去覆盖云端。用持久标志保证"登录后至少 pull 一次"。
   */
  private forcePullPending = false;

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
    // 初始化查询：仅当订阅流还没来过时才用它，避免迟到的旧状态覆盖登录事件
    void authClient.getStatus().then((status) => {
      if (!this.authStreamSeen) this.onAuthChange(status, false);
    });
    authClient.onAuthChange((status) => this.onAuthChange(status, true));

    window.addEventListener('online', () => {
      if (this.state.dirty && this.auth.state === 'signedIn') void this.syncNow();
    });
  }

  private onAuthChange(status: AuthStatus, fromStream = true): void {
    if (fromStream) this.authStreamSeen = true;
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
    if (switched) {
      this.forcePullPending = true;
      void this.syncNow(true);
    } else if (status.state === 'signedIn' && this.forcePullPending && !this.running) {
      // auth 迟到的状态更新也可能落在 switched=false 分支；
      // 只要挂起的强制 pull 还在、且当前没在同步，就补一次
      void this.syncNow(true);
    }
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
    // 一旦开始执行就消费挂起的强制 pull，保证本次一定拉云端
    const mustPull = forcePull || this.forcePullPending;
    this.forcePullPending = false;
    this.setState({ status: 'syncing', error: null });

    try {
      // 登录/切换后、或本地无未推改动时都先拉云端再合并。
      // 绝不能在 forcePullPending 未消费时跳过 pull——否则会用本地空快照覆盖云端。
      if (mustPull || !this.state.dirty) {
        const remote = await this.syncClient.pull();
        if (remote) {
          // 重新读本地：pull 是网络请求，期间用户可能已答题并写入 completedDates。
          // 若用函数开头那个过期的 local 合并再 applySnapshot，会把刚写入的新数据覆盖掉，
          // 随后 push 便把空快照推上云端——这是「注册后立刻答题、进度丢失」的根因。
          const freshLocal = await exportSnapshot();
          const merged = mergeSnapshots(freshLocal, remote);
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
        // 即使 lastSyncAt 时间戳因时钟精度相同，也要递增 revision 让 UI 重载刚 pull 的数据
        revision: this.state.revision + 1,
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
