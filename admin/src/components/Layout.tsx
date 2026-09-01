import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const sections: { title: string; items: { label: string; to: string; icon: string; badge?: string }[] }[] = [
  { title: 'Overview', items: [{ label: 'Dashboard', to: '/admin', icon: '◧' }, { label: 'Audit Log', to: '/admin/audit', icon: '≡' }] },
  {
    title: 'Users & Techs',
    items: [
      { label: 'Users', to: '/admin/users', icon: '◐' },
      { label: 'Technicians', to: '/admin/technicians', icon: '⬣' },
      { label: 'Verifications', to: '/admin/verifications', icon: '✓' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Requests', to: '/admin/requests', icon: '⧉' },
      { label: 'Offers', to: '/admin/offers', icon: '₿' },
      { label: 'Appointments', to: '/admin/appointments', icon: '◰' },
      { label: 'Chat Rooms', to: '/admin/chat', icon: '💬' },
    ],
  },
  {
    title: 'Commerce',
    items: [
      { label: 'Payments', to: '/admin/payments', icon: '₹' },
      { label: 'Transactions', to: '/admin/transactions', icon: '⇄' },
      { label: 'Promo Codes', to: '/admin/promos', icon: '🏷' },
      { label: 'InstaPay Console', to: '/admin/instapay', icon: '⚡' },
    ],
  },
  {
    title: 'Community',
    items: [
      { label: 'Posts', to: '/admin/posts', icon: '▭' },
      { label: 'Reviews', to: '/admin/reviews', icon: '★' },
      { label: 'Support', to: '/admin/tickets', icon: '☎' },
      { label: 'Notifications', to: '/admin/notifications', icon: '🔔' },
    ],
  },
  {
    title: 'Automation & AI',
    items: [
      { label: 'Push', to: '/admin/push', icon: '✉' },
      { label: 'Jobs / Cron', to: '/admin/jobs', icon: '⚙' },
      { label: 'AI Usage', to: '/admin/ai', icon: '≋' },
    ],
  },
  { title: 'System', items: [{ label: 'Admins', to: '/admin/admins', icon: '🛡️' }, { label: 'Families', to: '/admin/families', icon: '👪' }, { label: 'Search Index', to: '/admin/search', icon: '⌕' }, { label: 'Storage', to: '/admin/storage', icon: '🗄' }] },
];

export function Layout({ children, title, subtitle }: { children: React.ReactNode; title?: string; subtitle?: string }) {
  const { admin, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">ب</div>
          <div className="brand-text">
            <h1>Basseeyta Admin</h1>
            <p>بسيطة — Control Center</p>
          </div>
        </div>
        <nav className="nav">
          {sections.map((s) => (
            <div key={s.title}>
              <div className="nav-section">{s.title}</div>
              {s.items.map((it) => (
                <NavLink key={it.to} to={it.to} end={it.to === '/admin'} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  <span className="ico">{it.icon}</span>
                  {it.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="user-chip">
            <div className="user-avatar">{(admin?.email?.[0] || 'A').toUpperCase()}</div>
            <div className="user-meta">
              <strong>{admin?.name || 'Super Admin'}</strong>
              <span>{admin?.email || 'admin@basseeyta.com'}</span>
            </div>
          </div>
          <button
            className="btn btn-ghost"
            style={{ width: '100%', marginTop: 8 }}
            onClick={() => {
              logout();
              navigate('/admin/login');
            }}
          >
            Sign out
          </button>
          <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <a className="kbd" href="/" target="_blank" rel="noreferrer">
              API Docs
            </a>
            <a className="kbd" href="/socket-test.html" target="_blank" rel="noreferrer">
              Socket Tester
            </a>
            <a className="kbd" href="/health" target="_blank" rel="noreferrer">
              Health
            </a>
          </div>
        </div>
      </aside>
      <div className="main">
        <div className="topbar">
          <div>
            <h2>{title || 'Dashboard'}</h2>
            {subtitle && <div style={{ fontSize: 12, color: '#64748B' }}>{subtitle}</div>}
          </div>
          <div className="topbar-meta">
            <span className="pill live">
              <span className="dot" />
              Live — http://basseeyta.duckdns.org/
            </span>
            <span className="pill" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
              {admin?.email}
            </span>
          </div>
        </div>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
