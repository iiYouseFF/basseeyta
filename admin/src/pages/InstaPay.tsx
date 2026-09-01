import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Badge, Empty, Pagination } from '../components/DataTable';

type Insta = {
  id: string;
  userId: string;
  technicianId: string;
  requestId: string;
  amount: number;
  status: 'pending' | 'verified';
  createdAt: string;
  created_at: string;
  verifiedAt?: string;
  closedAt?: string;
  technicianName?: string;
  userName?: string;
  orderTotal?: number;
  expectedCommission?: number;
  mismatch?: boolean;
};

export default function InstaPay() {
  const [data, setData] = useState<Insta[]>([]);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function load(p = page, s = status) {
    setLoading(true);
    setErr('');
    try {
      const params: any = { page: p, limit: 20 };
      if (s) params.status = s;
      const r = await api.get('/admin/api/instapay', { params });
      setData(r.data.data || []);
      setTotal(r.data.total ?? 0);
      setTotalPages(r.data.totalPages ?? 1);
      setPage(r.data.page ?? p);
    } catch (e: any) {
      setErr(e.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load(1, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function confirmReceive(row: Insta) {
    if (!window.confirm(`Confirm commission of ${row.amount} EGP received from technician ${row.technicianName || row.technicianId?.slice(0, 8)}?`)) return;
    try {
      await api.post(`/admin/api/instapay/${encodeURIComponent(row.id)}/confirm`);
      load(page, status);
    } catch (e: any) {
      alert(e.response?.data?.message || e.message);
    }
  }

  function commissionBadge(r: Insta) {
    const exp = r.expectedCommission ?? 0;
    if (r.mismatch) return <Badge tone="warning">mismatch</Badge>;
    if (exp > 0) {
      if (Number(r.amount) < exp) return <Badge tone="error">short</Badge>;
      if (Number(r.amount) > exp) return <Badge tone="info">over</Badge>;
      return <Badge tone="success">exact</Badge>;
    }
    return <Badge tone="muted">n/a</Badge>;
  }

  const pendingCount = (status === '' ? data : data.filter((d) => d.status === 'pending')).length;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="grid grid-4">
        <div className="card stat">
          <div className="stat-top">
            <div>
              <div className="stat-label">Pending</div>
              <div className="stat-value">{status === '' ? data.filter((d) => d.status === 'pending').length : pendingCount}</div>
              <div className="stat-sub">awaiting commission confirmation</div>
            </div>
            <div className="stat-ico amber">⚡</div>
          </div>
        </div>
        <div className="card stat">
          <div className="stat-top">
            <div>
              <div className="stat-label">Closed</div>
              <div className="stat-value">{status === '' ? data.filter((d) => d.status === 'verified').length : pendingCount}</div>
              <div className="stat-sub">verified & closed</div>
            </div>
            <div className="stat-ico green">✓</div>
          </div>
        </div>
        <div className="card stat">
          <div className="stat-top">
            <div>
              <div className="stat-label">Expected 7.5%</div>
              <div className="stat-value">{data.reduce((s, d) => s + (d.expectedCommission || 0), 0).toFixed(0)} EGP</div>
              <div className="stat-sub">of shown orders</div>
            </div>
            <div className="stat-ico blue">%</div>
          </div>
        </div>
        <div className="card stat">
          <div className="stat-top">
            <div>
              <div className="stat-label">Flagged</div>
              <div className="stat-value">{data.filter((d) => d.mismatch).length}</div>
              <div className="stat-sub">amount ≠ 7.5% of order</div>
            </div>
            <div className="stat-ico rose">⚠</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head" style={{ flexWrap: 'wrap' }}>
          <div>
            <h3>InstaPay Console</h3>
            <div style={{ fontSize: 12, color: '#64748B' }}>
              Technician commission transfers (expect 7.5% of order total) • confirm once the money arrives on your account
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="input" style={{ width: 160 }} value={status} onChange={(e) => { setStatus(e.target.value); load(1, e.target.value); }}>
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="verified">Verified</option>
            </select>
            <button className="btn btn-ghost" onClick={() => load(page, status)} disabled={loading}>
              ↻ Refresh
            </button>
          </div>
        </div>
        {err && <div style={{ margin: 12, padding: 10, background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', borderRadius: 10, fontSize: 13 }}>{err}</div>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Technician</th>
                <th>User</th>
                <th>Amount</th>
                <th>Order total</th>
                <th>Expected 7.5%</th>
                <th>Check</th>
                <th>Status</th>
                <th style={{ width: 120 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: 24, color: '#64748B' }}>
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && data.length === 0 && (
                <tr>
                  <td colSpan={9}>
                    <Empty title="No InstaPay transfers" desc="Nothing in this queue yet." />
                  </td>
                </tr>
              )}
              {!loading &&
                data.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{new Date(r.createdAt || r.created_at || '').toLocaleString()}</td>
                    <td>{r.technicianName || <span className="kbd">{r.technicianId?.slice(0, 10) || '—'}</span>}</td>
                    <td style={{ fontSize: 12, color: '#64748B' }}>{r.userName || <span className="kbd">{r.userId?.slice(0, 8)}</span>}</td>
                    <td>
                      <strong>{r.amount} EGP</strong>
                    </td>
                    <td>{r.orderTotal ? `${r.orderTotal} EGP` : '—'}</td>
                    <td>{r.expectedCommission ? `${r.expectedCommission} EGP` : '—'}</td>
                    <td>{commissionBadge(r)}</td>
                    <td>{r.status === 'pending' ? <Badge tone="warning">pending</Badge> : <Badge tone="success">verified</Badge>}</td>
                    <td>
                      {r.status === 'pending' ? (
                        <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => confirmReceive(r)}>
                          Confirm
                        </button>
                      ) : (
                        <span style={{ fontSize: 12, color: '#94A3B8' }}>{r.closedAt ? new Date(r.closedAt).toLocaleDateString() : 'closed'}</span>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} total={total} onPage={(p) => load(p, status)} />
        </div>
        <div style={{ padding: '8px 12px', fontSize: 11, color: '#94A3B8' }}>
          Confirmation is audited (action <code>confirm</code>, table <code>instapay</code>) — the WhatsApp verification-code flow lives on the payments API (<code>POST /payments/instapay/:id/verify</code>).
        </div>
      </div>
    </div>
  );
}