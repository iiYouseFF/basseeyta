import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Badge, Modal, Pagination, SearchInput } from '../components/DataTable';

export default function Verifications() {
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);

  async function load(p = page) {
    setLoading(true);
    try {
      const r = await api.get('/admin/api/verifications', { params: { page: p, limit: 20, search: search || undefined, status: status || undefined } });
      setData(r.data.data);
      setTotal(r.data.total);
      setTotalPages(r.data.totalPages);
      setPage(r.data.page);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load(1);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => load(1), 350);
    return () => clearTimeout(t);
  }, [search, status]);

  async function decide(userId: string, newStatus: 'approved' | 'rejected') {
    if (!confirm(`${newStatus} verification for ${userId}?`)) return;
    await api.patch(`/admin/api/verifications/${encodeURIComponent(userId)}`, { status: newStatus });
    setSelected(null);
    load(page);
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="card">
        <div className="card-head">
          <div>
            <h3>Verifications (KYC)</h3>
            <div style={{ fontSize: 12, color: '#64748B' }}>Front/back ID from bucket <code>account_verification</code> — approve/reject audited</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <SearchInput value={search} onChange={setSearch} placeholder="Search name/phone…" />
            <select className="input" style={{ width: 160 }} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="pending">pending</option>
              <option value="approved">approved</option>
              <option value="rejected">rejected</option>
            </select>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Gov</th>
                <th>Status</th>
                <th>Front / Back</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 24 }}>Loading…</td>
                </tr>
              )}
              {!loading &&
                data.map((v: any) => (
                  <tr key={v.user_id || v.userId}>
                    <td>{v.name}</td>
                    <td>
                      <span className="kbd">{v.phone}</span>
                    </td>
                    <td>{v.governorate || '—'}</td>
                    <td>
                      <Badge tone={v.status === 'pending' ? 'warning' : v.status === 'approved' ? 'success' : 'error'}>{v.status}</Badge>
                    </td>
                    <td style={{ fontSize: 12, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <div>{v.front_id_path || v.frontIdPath || '—'}</div>
                      <div style={{ color: '#94A3B8' }}>{v.back_id_path || v.backIdPath || ''}</div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => setSelected(v)}>
                          View
                        </button>
                        {v.status === 'pending' && (
                          <>
                            <button className="btn btn-primary" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => decide(v.user_id || v.userId, 'approved')}>
                              Approve
                            </button>
                            <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12, color: '#DC2626', borderColor: '#FECACA' }} onClick={() => decide(v.user_id || v.userId, 'rejected')}>
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              {!loading && data.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#64748B' }}>
                    No verifications
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} total={total} onPage={load} />
        </div>
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={`Verification — ${selected?.name || ''}`} footer={<button className="btn btn-ghost" onClick={() => setSelected(null)}>Close</button>}>
        {selected && (
          <div style={{ display: 'grid', gap: 10, fontSize: 13 }}>
            <div>
              <strong>User:</strong> {selected.name} — <span className="kbd">{selected.phone}</span> — {selected.governorate} {selected.city}
            </div>
            <div>
              <strong>Status:</strong> <Badge tone={selected.status === 'pending' ? 'warning' : selected.status === 'approved' ? 'success' : 'error'}>{selected.status}</Badge>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <div>
                <div className="label">Front ID Path</div>
                <div className="kbd" style={{ display: 'block', padding: 8, wordBreak: 'break-all' }}>
                  {selected.front_id_path || selected.frontIdPath}
                </div>
                <a href={`${api.defaults.baseURL || ''}/storage/account_verification/${selected.front_id_path || selected.frontIdPath}`} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ marginTop: 6, padding: '4px 8px', fontSize: 12 }}>
                  Open front (signed)
                </a>
              </div>
              <div>
                <div className="label">Back ID Path</div>
                <div className="kbd" style={{ display: 'block', padding: 8, wordBreak: 'break-all' }}>
                  {selected.back_id_path || selected.backIdPath}
                </div>
                <a href={`${api.defaults.baseURL || ''}/storage/account_verification/${selected.back_id_path || selected.backIdPath}`} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ marginTop: 6, padding: '4px 8px', fontSize: 12 }}>
                  Open back (signed)
                </a>
              </div>
            </div>
            {selected.status === 'pending' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => decide(selected.user_id || selected.userId, 'approved')}>
                  ✓ Approve
                </button>
                <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => decide(selected.user_id || selected.userId, 'rejected')}>
                  ✕ Reject
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
