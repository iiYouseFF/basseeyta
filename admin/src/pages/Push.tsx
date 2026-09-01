import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Badge } from '../components/DataTable';

type Notif = { id: string; userId: string; title: string; body: string; type: string; createdAt: string; isRead?: boolean };

export default function Push() {
  const [form, setForm] = useState({ target: 'all', userType: 'user', governorate: '', userId: '', title: '', body: '', type: 'admin_push' });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState('');
  const [history, setHistory] = useState<Notif[]>([]);

  async function loadHistory() {
    try {
      const r = await api.get('/admin/api/notifications', { params: { type: 'admin_push', limit: 10 } });
      setHistory(r.data.data || []);
    } catch {}
  }
  useEffect(() => {
    loadHistory();
  }, []);

  async function send() {
    if (!form.title.trim() || !form.body.trim()) return alert('Title and body are required');
    if (form.target === 'governorate' && !form.governorate.trim()) return alert('Governorate required for target');
    if (form.target === 'user' && !form.userId.trim()) return alert('User ID required for target');
    setSending(true);
    setErr('');
    setResult(null);
    try {
      const payload: any = {
        target: form.target,
        title: form.title.trim(),
        body: form.body.trim(),
        type: form.type.trim() || 'admin_push',
      };
      if (form.target === 'userType') payload.userType = form.userType;
      if (form.target === 'governorate') payload.governorate = form.governorate.trim();
      if (form.target === 'user') payload.userId = form.userId.trim();
      const r = await api.post('/admin/api/push/send', payload);
      setResult(r.data.data);
      setForm((f) => ({ ...f, title: '', body: '' }));
      loadHistory();
    } catch (e: any) {
      setErr(e.response?.data?.message || e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="grid grid-2">
        <div className="card">
          <div className="card-head">
            <h3>Compose Push</h3>
            <span className="badge badge-info">admin → FCM + sockets</span>
          </div>
          <div className="card-pad" style={{ display: 'grid', gap: 4 }}>
            <label className="label">Audience</label>
            <select className="input" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })}>
              <option value="all">All users + technicians</option>
              <option value="userType">By account type</option>
              <option value="governorate">By governorate</option>
              <option value="user">Single user</option>
            </select>

            {form.target === 'userType' && (
              <>
                <label className="label">Account type</label>
                <select className="input" value={form.userType} onChange={(e) => setForm({ ...form, userType: e.target.value })}>
                  <option value="user">Users</option>
                  <option value="technician">Technicians</option>
                </select>
              </>
            )}
            {form.target === 'governorate' && (
              <>
                <label className="label">Governorate</label>
                <input className="input" value={form.governorate} onChange={(e) => setForm({ ...form, governorate: e.target.value })} placeholder="e.g. القاهرة" />
              </>
            )}
            {form.target === 'user' && (
              <>
                <label className="label">User ID</label>
                <input className="input" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} placeholder="uuid or phone (technician)" />
              </>
            )}

            <label className="label">Title</label>
            <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="عرض خاص" maxLength={120} />
            <label className="label">Body</label>
            <textarea className="input" rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="نص الإشعار" maxLength={1000} />
            <label className="label">Type</label>
            <input className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="admin_push" />

            {err && <div style={{ marginTop: 10, padding: 10, background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', borderRadius: 10, fontSize: 13 }}>{err}</div>}
            {result && (
              <div style={{ marginTop: 10, padding: 10, background: '#DCFCE7', border: '1px solid #A7F3D0', color: '#065F46', borderRadius: 10, fontSize: 13 }}>
                Sent ✓ recipients {result.recipients} • FCM {result.fcm} {!result.messaging && '(no FCM configured — in-app/socket only)'}
              </div>
            )}

            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={send} disabled={sending}>
              {sending ? 'Sending…' : `Send to ${form.target === 'all' ? 'everyone' : form.target}`}
            </button>
            <div style={{ marginTop: 8, fontSize: 11, color: '#64748B', background: '#F1F5F9', padding: 8, borderRadius: 8 }}>
              Broadcasts go to matched devices with an FCM token; if none configured, clients still receive a live socket event. Sends are audited.
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Recent admin pushes</h3>
            <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={loadHistory}>
              ↻
            </button>
          </div>
          <div className="table-wrap">
            {history.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>No admin pushes yet.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Body</th>
                    <th>User</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((n) => (
                    <tr key={n.id}>
                      <td>
                        <strong>{n.title}</strong>
                      </td>
                      <td style={{ fontSize: 12, color: '#475569' }}>{n.body}</td>
                      <td>
                        <span className="kbd">{n.userId ? n.userId.slice(0, 8) + '…' : '—'}</span>
                      </td>
                      <td style={{ fontSize: 12 }}>{new Date(n.createdAt || '').toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div style={{ padding: '8px 12px', fontSize: 11, color: '#94A3B8' }}>
            Notifications are stored per-user in the notifications table and delivered via <Badge tone="info">socket.io /notifications</Badge> room.
          </div>
        </div>
      </div>
    </div>
  );
}