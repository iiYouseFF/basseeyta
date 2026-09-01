import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Pagination, SearchInput } from '../components/DataTable';

export default function Audit() {
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [table, setTable] = useState('');
  const [action, setAction] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  async function load(p = page) {
    setLoading(true);
    try {
      const r = await api.get('/admin/api/audit-logs', { params: { page: p, limit: 20, table: table || undefined, action: action || undefined, adminEmail: search || undefined } });
      setData(r.data.data);
      setTotal(r.data.total);
      setTotalPages(r.data.totalPages);
      setPage(r.data.page);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load(1);
  }, [table, action]);
  useEffect(() => {
    const t = setTimeout(() => load(1), 400);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="card">
        <div className="card-head" style={{ flexWrap: 'wrap' }}>
          <div>
            <h3>Admin Audit Log</h3>
            <div style={{ fontSize: 12, color: '#64748B' }}>{total} actions — every login/create/update/delete/approve is logged with diff, IP, admin</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <SearchInput value={search} onChange={setSearch} placeholder="Filter by admin email…" />
            <select className="input" style={{ width: 140 }} value={table} onChange={(e) => setTable(e.target.value)}>
              <option value="">All tables</option>
              <option value="users">users</option>
              <option value="technicians">technicians</option>
              <option value="service_requests">service_requests</option>
              <option value="offers">offers</option>
              <option value="verifications">verifications</option>
              <option value="support_tickets">support_tickets</option>
              <option value="promo_codes">promo_codes</option>
            </select>
            <select className="input" style={{ width: 130 }} value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="">All actions</option>
              <option value="login">login</option>
              <option value="create">create</option>
              <option value="update">update</option>
              <option value="delete">delete</option>
              <option value="approve">approve</option>
              <option value="reject">reject</option>
            </select>
            <button className="btn btn-ghost" onClick={() => load(page)}>↻ Refresh</button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Admin</th>
                <th>Action</th>
                <th>Table</th>
                <th>Record</th>
                <th>Diff</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 24 }}>Loading…</td>
                </tr>
              )}
              {!loading &&
                data.map((r) => (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{new Date(r.created_at || r.createdAt || '').toLocaleString()}</td>
                    <td>
                      <span className="kbd" style={{ fontSize: 11 }}>{r.admin_email}</span>
                    </td>
                    <td>
                      <span className={`badge badge-${r.action === 'login' ? 'info' : r.action === 'delete' ? 'error' : r.action === 'create' ? 'success' : 'muted'}`}>{r.action}</span>
                    </td>
                    <td>
                      <span className="kbd">{r.table_name || '—'}</span>
                    </td>
                    <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>{r.record_id ? r.record_id.slice(0, 8) + '…' : '—'}</td>
                    <td style={{ maxWidth: 320 }}>
                      <div className="log" style={{ maxHeight: 80, fontSize: 10, padding: 6, background: '#F8FAFC', color: '#1E293B', borderColor: '#E2E8F0' }}>{typeof r.diff === 'string' ? r.diff.slice(0, 400) : JSON.stringify(r.diff || r.diff_obj || {}, null, 0).slice(0, 400) || '—'}</div>
                    </td>
                    <td style={{ fontSize: 11, color: '#94A3B8' }}>{r.ip_address || '—'}</td>
                  </tr>
                ))}
              {!loading && data.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 24, color: '#64748B' }}>No audit entries yet — perform an action to generate logs.</td>
                </tr>
              )}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} total={total} onPage={load} />
        </div>
      </div>
    </div>
  );
}
