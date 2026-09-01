import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const { setToken, setAdmin } = useAuth();
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setOk('');
    if (password !== confirm) {
      setErr('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setErr('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      const r = await api.post('/admin/api/auth/register', { email: email.trim(), password, name: name.trim() || undefined });
      const { token, admin } = r.data.data;
      setToken(token);
      setAdmin(admin);
      setOk('Account created — redirecting…');
      setTimeout(() => navigate('/admin'), 600);
    } catch (e: any) {
      const msg = e.response?.data?.message || e.message || 'Sign up failed';
      const details = e.response?.data?.errors ? `: ${JSON.stringify(e.response.data.errors).slice(0, 200)}` : '';
      setErr(msg + details);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#F8FAFC', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 460 }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: '#0056D2', display: 'inline-grid', placeItems: 'center', color: 'white', fontWeight: 700, fontSize: 22 }}>ب</div>
          <h1 style={{ margin: '12px 0 4px', fontSize: 22, fontWeight: 700, color: '#1E293B' }}>Create admin account</h1>
          <p style={{ margin: 0, color: '#64748B', fontSize: 13 }}>New admin • Secure • Audited • Same domain</p>
        </div>
        <form onSubmit={submit} className="card" style={{ padding: 20 }} autoComplete="off">
          <label className="label">Full Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Ahmed Admin" type="text" autoComplete="name" />
          <label className="label">Email</label>
          <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter email address" type="email" required autoComplete="email" autoFocus />
          <label className="label">Password</label>
          <div style={{ position: 'relative' }}>
            <input
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              type={showPw ? 'text' : 'password'}
              required
              autoComplete="new-password"
              style={{ paddingRight: 44 }}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, padding: '4px 8px', fontSize: 11, color: '#475569', cursor: 'pointer' }}
              tabIndex={-1}
            >
              {showPw ? 'Hide' : 'Show'}
            </button>
          </div>
          <label className="label">Confirm Password</label>
          <input className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat password" type={showPw ? 'text' : 'password'} required autoComplete="new-password" />
          {err && <div style={{ marginTop: 12, padding: 10, borderRadius: 10, background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', fontSize: 13 }}>{err}</div>}
          {ok && <div style={{ marginTop: 12, padding: 10, borderRadius: 10, background: '#DCFCE7', border: '1px solid #A7F3D0', color: '#065F46', fontSize: 13 }}>{ok}</div>}
          <button className="btn btn-primary" style={{ width: '100%', marginTop: 16, height: 44, fontSize: 14 }} disabled={loading} type="submit">
            {loading ? 'Creating…' : 'Sign Up'}
          </button>
          <div style={{ marginTop: 12, textAlign: 'center', fontSize: 13, color: '#475569' }}>
            Already have an account?{' '}
            <Link to="/admin/login" style={{ color: '#0056D2', fontWeight: 700, textDecoration: 'none' }}>
              Login
            </Link>
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: '#94A3B8', textAlign: 'center' }}>Rate-limited (5 / 15 min) • All creations audited • Password hashed with bcrypt</div>
        </form>
        <div style={{ marginTop: 14, textAlign: 'center', fontSize: 11, color: '#94A3B8' }}>Cairo • RTL-aware • #0056D2 • Private admin area</div>
      </div>
    </div>
  );
}
