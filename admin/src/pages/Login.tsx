import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { loginAdmin } from '../lib/api';
import { useAuth } from '../lib/auth';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [lockUntil, setLockUntil] = useState<number | null>(null);
  const { setToken, setAdmin } = useAuth();
  const navigate = useNavigate();

  const isLocked = lockUntil !== null && Date.now() < lockUntil;
  const lockSeconds = isLocked ? Math.ceil((lockUntil! - Date.now()) / 1000) : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (isLocked) return;
    setLoading(true);
    setErr('');
    try {
      const { token, admin } = await loginAdmin(email.trim(), password);
      setToken(token);
      setAdmin(admin);
      setAttempts(0);
      navigate('/admin');
    } catch (e: any) {
      const msg = e.response?.data?.message || e.message || 'Login failed';
      const nextAttempts = attempts + 1;
      setAttempts(nextAttempts);
      if (nextAttempts >= 5) {
        setLockUntil(Date.now() + 60_000);
        setErr('Too many failed attempts. Account locked for 60 seconds.');
      } else {
        setErr(msg + (nextAttempts >= 3 ? ` — ${5 - nextAttempts} attempts left before lockout.` : ''));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#F8FAFC', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: '#0056D2', display: 'inline-grid', placeItems: 'center', color: 'white', fontWeight: 700, fontSize: 22 }}>ب</div>
          <h1 style={{ margin: '12px 0 4px', fontSize: 22, fontWeight: 700, color: '#1E293B' }}>Basseeyta Admin</h1>
          <p style={{ margin: 0, color: '#64748B', fontSize: 13 }}>Secure superadmin access</p>
          <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, background: '#EFF6FF', border: '1px solid #DBEAFE', color: '#1E40AF', fontSize: 11, fontWeight: 600 }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: '#10B981', display: 'inline-block' }} /> Secure login • Rate-limited • Audited
          </div>
        </div>
        <form onSubmit={submit} className="card" style={{ padding: 20 }} autoComplete="off">
          <label className="label">Email</label>
          <input
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter email address"
            type="email"
            required
            autoComplete="username"
            autoFocus
            disabled={isLocked}
          />
          <label className="label">Password</label>
          <div style={{ position: 'relative' }}>
            <input
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              type={showPw ? 'text' : 'password'}
              required
              autoComplete="current-password"
              disabled={isLocked}
              style={{ paddingRight: 44 }}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, padding: '4px 8px', fontSize: 11, color: '#475569', cursor: 'pointer' }}
              tabIndex={-1}
              aria-label={showPw ? 'Hide password' : 'Show password'}
            >
              {showPw ? 'Hide' : 'Show'}
            </button>
          </div>
          {err && <div style={{ marginTop: 12, padding: 10, borderRadius: 10, background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', fontSize: 13 }}>{err}</div>}
          {isLocked && <div style={{ marginTop: 8, fontSize: 12, color: '#92400E', background: '#FEF3C7', border: '1px solid #FDE68A', padding: '8px 10px', borderRadius: 10 }}>Locked for {lockSeconds}s — please wait.</div>}
          <button className="btn btn-primary" style={{ width: '100%', marginTop: 16, height: 44, fontSize: 14 }} disabled={loading || isLocked} type="submit">
            {loading ? 'Signing in…' : isLocked ? `Locked (${lockSeconds}s)` : 'Login'}
          </button>
          <div style={{ marginTop: 12, textAlign: 'center', fontSize: 13, color: '#475569' }}>
            Don't have an account?{' '}
            <Link to="/admin/register" style={{ color: '#0056D2', fontWeight: 700, textDecoration: 'none' }}>
              Sign Up
            </Link>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <Link to="/admin/register" className="btn btn-secondary" style={{ flex: 1, fontSize: 12, justifyContent: 'center', textDecoration: 'none' }}>
              Sign Up
            </Link>
            <a href="/health" target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ flex: 1, fontSize: 12, justifyContent: 'center' }}>
              API Health
            </a>
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: '#94A3B8', textAlign: 'center' }}>Protected by rate-limit (5 attempts / 15 min) • All logins audited</div>
        </form>
        <div style={{ marginTop: 14, textAlign: 'center', fontSize: 11, color: '#94A3B8' }}>Cairo • RTL-aware • #0056D2 • Private admin area</div>
      </div>
    </div>
  );
}
