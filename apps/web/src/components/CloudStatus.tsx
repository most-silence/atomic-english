import { useEffect, useState } from 'react';
import type { AuthStatus } from '@atomic/api-client';
import { configured, getAuthClient, orchestrator } from '../sync';
import type { SyncState } from '../sync/orchestrator';

/**
 * 云同步状态与登录入口。
 * 未配置后端时完全不渲染——本地优先架构下 app 照常用，不给用户看无意义的东西。
 */
export default function CloudStatus() {
  const [auth, setAuth] = useState<AuthStatus>({ state: 'signedOut' });
  const [sync, setSync] = useState<SyncState>(orchestrator.getState());
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!configured) return;
    const offAuth = getAuthClient().onAuthChange(setAuth);
    const offSync = orchestrator.subscribe(setSync);
    return () => { offAuth(); offSync(); };
  }, []);

  if (!configured) return null;

  const submit = async (mode: 'in' | 'up') => {
    setBusy(true);
    setError(null);
    try {
      const client = getAuthClient();
      const status = mode === 'in'
        ? await client.signIn(email, password)
        : await client.signUp(email, password);
      setAuth(status);
      if (status.state === 'signedIn') setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await getAuthClient().signOut();
    setAuth({ state: 'signedOut' });
  };

  return (
    <div className="cloud-status" data-testid="cloud-status">
      {auth.state === 'signedOut' ? (
        <>
          <button type="button" className="cloud-btn" onClick={() => setOpen((v) => !v)}>
            登录以同步进度
          </button>
          {open && (
            <div className="cloud-panel">
              <input
                className="cloud-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="邮箱"
                aria-label="邮箱"
              />
              <input
                className="cloud-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="密码"
                aria-label="密码"
              />
              <div className="cloud-actions">
                <button type="button" className="cloud-btn" disabled={busy} onClick={() => void submit('in')}>
                  登录
                </button>
                <button type="button" className="cloud-btn" disabled={busy} onClick={() => void submit('up')}>
                  注册
                </button>
              </div>
              {error && <p className="cloud-error">{error}</p>}
              <p className="cloud-hint">不登录也能正常使用，进度保存在本机。</p>
            </div>
          )}
        </>
      ) : (
        <div className="cloud-row">
          <span className="cloud-email">{auth.email ?? auth.userId.slice(0, 8)}</span>
          <span className={`cloud-dot ${sync.status}`} />
          <span className="cloud-state">
            {sync.status === 'syncing' ? '同步中' : sync.status === 'error' ? '待同步' : '已同步'}
          </span>
          <button type="button" className="cloud-link" onClick={() => void signOut()}>
            退出
          </button>
        </div>
      )}
      {sync.error && <p className="cloud-error">{sync.error}</p>}
    </div>
  );
}
