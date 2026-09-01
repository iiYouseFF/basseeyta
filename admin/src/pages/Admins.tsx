import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Badge, Empty, Modal } from '../components/DataTable';

type AdminRow = { id: string; email: string; name: string; is_superadmin: boolean; is_active: boolean; created_at: string };

export default function Admins() {
  const [data, setData] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', name: '', is_superadmin: false });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setErr('');
    try {
      const r = await api.get('/admin/api/admins');
      setData(r.data.data || []);
    } catch (e: any) {
      setErr(e.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function create() {
    if (!form.email || !form.password) return alert('Email and password required');
    if (form.password.length < 8) return alert('Password must be at least 8 characters');
    setSaving(true);
    try {
      await api.post('/admin/api/admins', { email: form.email.trim(), password: form.password, name: form.name.trim() || undefined, is_superadmin: form.is_superadmin });
      setShowCreate(false);
      setForm({ email: '', password: '', name: '', is_superadmin: false });
      load();
    } catch (e: any) {
      alert(e.response?.data?.message || e.message);
    } finally {
      setSaving(false);
    }
  }

  async function del(id: string, email: string) {
    if (!confirm(`Delete admin ${email}? This is audited.`)) return;
    try {
      await api.delete(`/admin/api/admins/${encodeURIComponent(id)}`);
      load();
    } catch (e: any) {
      alert(e.response?.data?.message || e.message);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="card">
        <div className="card-head" style={{ flexWrap: 'wrap' }}>
          <div>
            <h3>Admins</h3>
            <div style={{ fontSize: 12, color: '#64748B' }}>Manage admin accounts • All creations/deletions audited • Superadmin protected</div>
          </div>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            + Create Admin
          </button>
        </div>
        {err && <div style={{ margin: 12, padding: 10, background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', borderRadius: 10, fontSize: 13 }}>{err}</div>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Active</th>
                <th>Created</th>
                <th style={{ width: 100 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 24 }}>Loading…</td>
                </tr>
              )}
              {!loading && data.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <Empty title="No admins" desc="Create your first admin." />
                  </td>
                </tr>
              )}
              {!loading &&
                data.map((a) => (
                  <tr key={a.id}>
                    <td>{a.name}</td>
                    <td>
                      <span className="kbd">{a.email}</span>
                    </td>
                    <td>{a.is_superadmin ? <Badge tone="info">superadmin</Badge> : <Badge tone="muted">admin</Badge>}</td>
                    <td>{a.is_active ? <Badge tone="success">active</Badge> : <Badge tone="error">inactive</Badge>}</td>
                    <td style={{ fontSize: 12 }}>{new Date(a.created_at || '').toLocaleString()}</td>
                    <td>
                      <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12, color: '#DC2626', borderColor: '#FECACA' }} onClick={() => del(a.id, a.email)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <div style={{ padding: '8px 12px', fontSize: 11, color: '#94A3B8' }}>
            Total {data.length} admins • Deleting last superadmin is blocked • Deleting self is blocked
          </div>
        </div>
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create new admin" footer={
        <>
          <button className="btn btn-ghost" onClick={() => setShowCreate(false)} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={create} disabled={saving}>{saving ? 'Creating…' : 'Create Admin'}</button>
        </>
      }>
        <label className="label">Email</label>
        <input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="newadmin@basseeyta.com" type="email" />
        <label className="label">Password</label>
        <input className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 8 characters" type="password" />
        <label className="label">Full Name</label>
        <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., Ahmed Admin" type="text" />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13 }}>
          <input type="checkbox" checked={form.is_superadmin} onChange={(e) => setForm({ ...form, is_superadmin: e.target.checked })} /> Superadmin
        </label>
        <div style={{ marginTop: 10, fontSize: 11, color: '#64748B', background: '#F1F5F9', padding: 8, borderRadius: 8 }}>Password hashed with bcrypt (10 rounds) • Creation is audited • Rate-limited</div>
      </Modal>
    </div>
  );
}
