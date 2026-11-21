import { useEffect, useState } from 'react';
import type { AuthStatus } from '@atomic/api-client';
import { configured, getAuthClient, orchestrator } from '../sync';
import type { SyncState } from '../sync/orchestrator';

/**
 * 云同步登录卡：嵌在复习页（词汇界面）顶部，未登录时常驻显示邮箱/注册入口。
 *
 * 设计要点：
 * - 之前是页面顶部的折叠按钮，用户反馈"无法注册"——入口太隐蔽。
 * - 未配置后端时**仍然渲染**，明确告知"未连接云端"，而不是整个消失让人以为 bug。
 * - 注册/登录失败必须把真实错误显示出来，不能静默无反应。
 */
export default function CloudStatus() {
  const [auth, setAuth] = useState<AuthStatus>({ state: 'signedOut' });
  const [sync, setSync] = useState<SyncState>(orchestrator.getState());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!configured) return;
    const offAuth = getAuthClient().onAuthChange(setAuth);
    const offSync = orchestrator.subscribe(setSync);
    return () => { offAuth(); offSync(); };
  }, []);

  const submit = async (mode: 'in' | 'up') => {
    if (!email.trim() || !password) {
      setError('请输入邮箱和密码');
      setInfo(null);
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const client = getAuthClient();
      const status = mode === 'in'
        ? await client.signIn(email.trim(), password)
        : await client.signUp(email.trim(), password);
      setAuth(status);
      if (status.state !== 'signedIn') {
        setInfo('注册成功，请到邮箱确认后再登录');
      }
    } catch (err) {
      // 真实错误必须显示（网络不可达 / 密码太短 / 邮箱已注册…）
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    try {
      await getAuthClient().signOut();
      setAuth({ state: 'signedOut' });
      setError(null);
      setInfo(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  // 后端未配置：明确告知，而不是整个消失
  if (!configured) {
    return (
      <div className="cloud-card cloud-card-offline" data-testid="cloud-status">
        <p className="cloud-title">云同步未连接</p>
        <p className="cloud-hint">当前未配置后端，进度保存在本机。配置后即可注册账号跨设备同步。</p>
      </div>
    );
  }

  return (
    <div className="cloud-card" data-testid="cloud-status">
      {auth.state === 'signedOut' ? (
        <>
          <p className="cloud-title">登录 / 注册，同步进度</p>
          <input
            className="cloud-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="邮箱"
            aria-label="邮箱"
            autoComplete="username"
            spellCheck={false}
          />
          <input
            className="cloud-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码（至少 6 位）"
            aria-label="密码"
            autoComplete="current-password"
          />
          <div className="cloud-actions">
            <button type="button" className="cloud-btn primary" disabled={busy} onClick={() => void submit('in')}>
              登录
            </button>
            <button type="button" className="cloud-btn" disabled={busy} onClick={() => void submit('up')}>
              注册
            </button>
          </div>
          {error && <p className="cloud-error" role="alert" data-testid="cloud-error">{error}</p>}
          {info && <p className="cloud-info" data-testid="cloud-info">{info}</p>}
          <p className="cloud-hint">不登录也能正常使用，进度保存在本机。</p>
        </>
      ) : (
        <div className="cloud-row" data-sync-state={sync.status} data-last-sync={sync.lastSyncAt ?? ''} data-testid="cloud-row">
          <span className="cloud-email" title={auth.email ?? ''}>{auth.email ?? auth.userId.slice(0, 8)}</span>
          <span className={`cloud-dot ${sync.status}`} />
          <span className="cloud-state">
            {sync.status === 'syncing' ? '同步中' : sync.status === 'error' ? '待同步' : '已同步'}
          </span>
          <button type="button" className="cloud-link" onClick={() => void signOut()}>退出</button>
        </div>
      )}
      {auth.state === 'signedIn' && error && <p className="cloud-error" role="alert">{error}</p>}
      {auth.state === 'signedIn' && sync.error && <p className="cloud-error">{sync.error}</p>}
    </div>
  );
}
