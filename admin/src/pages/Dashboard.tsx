import { useEffect, useState } from 'react';
import { fetchStats, api } from '../lib/api';
import { Link } from 'react-router-dom';

function Stat({ label, value, sub, icon, color }: any) {
  return (
    <div className="card stat">
      <div className="stat-top">
        <div>
          <div className="stat-label">{label}</div>
          <div className="stat-value">{value}</div>
          {sub && <div className="stat-sub">{sub}</div>}
        </div>
        <div className={`stat-ico ${color}`}>{icon}</div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<any>(null);
  const [err, setErr] = useState('');
  const [health, setHealth] = useState<any>(null);

  useEffect(() => {
    fetchStats()
      .then(setStats)
      .catch((e) => setErr(e.message));
    api
      .get('/health')
      .then((r) => setHealth(r.data))
      .catch(() => {});
  }, []);

  if (err) return <div className="card card-pad" style={{ color: '#DC2626' }}>Failed to load stats: {err}</div>;
  if (!stats) return <div className="card card-pad">Loading dashboard…</div>;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="hero">
        <div>
          <h1>مرحباً — Basseeyta Control Center</h1>
          <p>Monitor, moderate, and edit every record. All actions are audited.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/admin/audit" className="btn" style={{ background: 'white', color: '#0056D2' }}>
            View Audit Log →
          </Link>
          <Link to="/admin/verifications" className="btn" style={{ background: 'rgba(255,255,255,.15)', color: 'white', border: '1px solid rgba(255,255,255,.25)' }}>
            {stats.verificationsPending} Pending Verifications
          </Link>
        </div>
      </div>

      <div className="grid grid-4">
        <Stat label="Users" value={stats.users} sub={`${stats.todayRequests} today requests`} icon="◐" color="blue" />
        <Stat label="Technicians" value={stats.technicians} icon="⬣" color="slate" />
        <Stat label="Requests" value={stats.serviceRequests} sub={Object.entries(stats.requestsByStatus || {}).slice(0, 3).map(([k, v]) => `${k}:${v}`).join(' • ')} icon="⧉" color="amber" />
        <Stat label="Offers" value={stats.offers} icon="₿" color="slate" />
        <Stat label="Reviews" value={stats.reviews ?? 0} icon="★" color="slate" />
        <Stat label="Revenue (completed)" value={`${stats.totalEarnings || 0} EGP`} sub={`${stats.paymentLogs} payment logs`} icon="₹" color="green" />
        <Stat label="Revenue today" value={`${stats.revenueToday || 0} EGP`} sub={`${stats.revenueMonth || 0} EGP this month`} icon="↗" color="green" />
        <Stat label="Active requests today" value={stats.todayActiveRequests ?? 0} sub={`${stats.todayRequests} total today`} icon="⚡" color="amber" />
        <Stat label="Posts" value={stats.posts} icon="▭" color="slate" />
        <Stat label="Open Tickets" value={stats.supportOpen} icon="☎" color="rose" />
        <Stat label="Pending KYC" value={stats.verificationsPending} icon="✓" color="amber" />
        <Stat label="AI calls today" value={stats.aiUsageToday ?? 0} sub={`${stats.aiUsageMonth ?? 0} this month`} icon="≋" color="blue" />
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-head">
            <h3>System Health</h3>
            <span className="pill live">
              <span className="dot" /> {health?.status || 'ok'}
            </span>
          </div>
          <div className="card-pad" style={{ display: 'grid', gap: 8, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748B' }}>Environment</span>
              <span className="kbd">{health?.env || 'production'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748B' }}>Version</span>
              <span>{health?.version || '1.0.0'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748B' }}>Uptime</span>
              <span>{health?.uptime ? Math.round(health.uptime / 60) + ' min' : '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748B' }}>DB</span>
              <span className="badge badge-success">{health?.db || 'connected'}</span>
            </div>
            <div className="log" style={{ marginTop: 8 }}>{JSON.stringify(health || stats, null, 2).slice(0, 800)}</div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Quick Actions</h3>
          </div>
          <div className="card-pad" style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Link to="/admin/verifications" className="btn btn-primary">
                Approve KYC →
              </Link>
              <Link to="/admin/instapay" className="btn btn-secondary">
                InstaPay Queue
              </Link>
              <Link to="/admin/requests" className="btn btn-ghost">
                Moderate Requests
              </Link>
              <Link to="/admin/promos" className="btn btn-ghost">
                Promo Codes
              </Link>
              <Link to="/admin/jobs" className="btn btn-ghost">
                Run Jobs
              </Link>
              <Link to="/admin/storage" className="btn btn-ghost">
                Storage
              </Link>
              <Link to="/admin/ai" className="btn btn-ghost">
                AI Usage
              </Link>
              <Link to="/admin/push" className="btn btn-ghost">
                Push Campaign
              </Link>
            </div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
              All edits are per-field whitelisted (`WHITELIST` in `admin.routes.ts`) and logged to <code>admin_audit_logs</code>. Use <Link to="/admin/audit">Audit Log</Link> to review.
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span className="badge badge-info">Single superadmin</span>
              <span className="badge badge-muted">same domain /admin</span>
              <span className="badge badge-muted">Cairo font</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Requests by Status</h3>
        </div>
        <div className="card-pad" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Object.entries(stats.requestsByStatus || {}).map(([k, v]: any) => (
            <span key={k} className="pill" style={{ background: '#F1F5F9' }}>
              <strong>{k}</strong> {v}
            </span>
          ))}
          {!Object.keys(stats.requestsByStatus || {}).length && <span style={{ color: '#94A3B8' }}>No requests yet</span>}
        </div>
      </div>
    </div>
  );
}
