import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Badge, Empty, Pagination } from '../components/DataTable';

type Entry = { entity_type: string; entity_id: string; title: string; description: string; governorate: string; specialty: string };

const toneFor = (t: string): any => (t === 'technician' ? 'info' : t === 'service_request' ? 'success' : t === 'user' ? 'muted' : 'warning');

export default function SearchIndex() {
  const [data, setData] = useState<Entry[]>([]);
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  async function load(p = page, et = entityType) {
    setLoading(true);
    setErr('');
    try {
      const params: any = { page: p, limit: 20 };
      if (et) params.entityType = et;
      const r = await api.get('/admin/api/search-index', { params });
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

  async function reindex() {
    if (!confirm('Rebuild the search index from current users/technicians/requests? Audited.')) return;
    setReindexing(true);
    setInfo('');
    try {
      const r = await api.post('/admin/api/search/reindex');
      setInfo(`Re-indexed ✓ ${r.data.data.rebuilt} entries built, ${r.data.data.total} in index`);
      load(1, entityType);
    } catch (e: any) {
      alert(e.response?.data?.message || e.message);
    } finally {
      setReindexing(false);
    }
  }

  async function del(e: Entry) {
    const key = `${e.entity_type}:${e.entity_id}`;
    if (!confirm(`Remove search entry "${key}"? Audited.`)) return;
    try {
      await api.delete(`/admin/api/search-index/${encodeURIComponent(key)}`);
      load(page, entityType);
    } catch (e: any) {
      alert(e.response?.data?.message || e.message);
    }
  }

  const byType = data.reduce(
    (acc, e) => {
      acc[e.entity_type] = (acc[e.entity_type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="grid grid-4">
        <div className="card stat">
          <div className="stat-top">
            <div>
              <div className="stat-label">Entries</div>
              <div className="stat-value">{total}</div>
              <div className="stat-sub">search index records</div>
            </div>
            <div className="stat-ico blue">⌕</div>
          </div>
        </div>
        {(['technician', 'service_request', 'user'] as const).map((t) => (
          <div className="card stat" key={t}>
            <div className="stat-top">
              <div>
                <div className="stat-label">{t}</div>
                <div className="stat-value">{byType[t] || 0}</div>
                <div className="stat-sub">in current view</div>
              </div>
              <div className="stat-ico slate">⌕</div>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head" style={{ flexWrap: 'wrap' }}>
          <div>
            <h3>Search Index</h3>
            <div style={{ fontSize: 12, color: '#64748B' }}>Full-text index used by <code>GET /search</code> • typed by entity</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="input" style={{ width: 220 }} value={entityType} onChange={(e) => { setEntityType(e.target.value); load(1, e.target.value); }}>
              <option value="">All entity types</option>
              <option value="user">User</option>
              <option value="technician">Technician</option>
              <option value="service_request">Service request</option>
            </select>
            <button className="btn btn-secondary" onClick={reindex} disabled={reindexing || loading}>
              {reindexing ? 'Re-indexing…' : '⤾ Re-index'}
            </button>
            <button className="btn btn-ghost" onClick={() => load(page, entityType)} disabled={loading}>
              ↻ Refresh
            </button>
          </div>
        </div>
        {err && <div style={{ margin: 12, padding: 10, background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', borderRadius: 10, fontSize: 13 }}>{err}</div>}
        {info && <div style={{ margin: 12, padding: 10, background: '#DCFCE7', border: '1px solid #A7F3D0', color: '#065F46', borderRadius: 10, fontSize: 13 }}>{info}</div>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>ID</th>
                <th>Title</th>
                <th>Description</th>
                <th>Gov</th>
                <th>Specialty</th>
                <th style={{ width: 90 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 24, color: '#64748B' }}>
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && data.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <Empty title="Index is empty" desc="Run Re-index to rebuild from current records." />
                  </td>
                </tr>
              )}
              {!loading &&
                data.map((e, i) => (
                  <tr key={`${e.entity_type}:${e.entity_id || i}`}>
                    <td>
                      <Badge tone={toneFor(e.entity_type)}>{e.entity_type}</Badge>
                    </td>
                    <td>
                      <span className="kbd">{e.entity_id?.slice(0, 12) || '—'}</span>
                    </td>
                    <td style={{ maxWidth: 280, wordBreak: 'break-word' }}>{e.title}</td>
                    <td style={{ maxWidth: 220, wordBreak: 'break-word', fontSize: 12, color: '#475569' }}>{e.description || '—'}</td>
                    <td style={{ fontSize: 12 }}>{e.governorate || '—'}</td>
                    <td style={{ fontSize: 12 }}>{e.specialty || '—'}</td>
                    <td>
                      <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12, color: '#DC2626', borderColor: '#FECACA' }} onClick={() => del(e)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} total={total} onPage={(p) => load(p, entityType)} />
        </div>
        <div style={{ padding: '8px 12px', fontSize: 11, color: '#94A3B8' }}>
          Re-index rebuilds in-memory entries for users/technicians/service-requests (the Supabase <code>search_index</code> table is preserved). Stale-entry GC is a cron job: <code>searchIndexGC</code>.
        </div>
      </div>
    </div>
  );
}