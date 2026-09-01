import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Badge, Empty, Pagination, SearchInput } from '../components/DataTable';

const BUCKETS = ['profiles', 'account_verification', 'request', 'task_images', 'community_posts'];

type FileRow = { name: string; size: number | null; mimetype: string | null; updatedAt: string | null; url: string | null; public: boolean; bucket: string };
type BucketMeta = { data: FileRow[]; total: number; page: number; limit: number; totalPages: number; bucket: string; public: boolean };

function fmtSize(n: number | null) {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Storage() {
  const [bucket, setBucket] = useState<string>('profiles');
  const [meta, setMeta] = useState<BucketMeta | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState('');

  async function load(b = bucket, p = meta?.page || 1, s = search) {
    setLoading(true);
    setErr('');
    try {
      const params: any = { page: p, limit: 50 };
      if (s) params.search = s;
      const r = await api.get(`/admin/api/storage/${encodeURIComponent(b)}`, { params });
      setMeta(r.data);
    } catch (e: any) {
      setErr(e.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(bucket, 1, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucket]);

  useEffect(() => {
    const t = setTimeout(() => load(bucket, 1, search), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function del(f: FileRow) {
    if (!confirm(`Delete ${bucket}/${f.name}? This is audited.`)) return;
    try {
      await api.delete(`/admin/api/storage/${encodeURIComponent(bucket)}/${encodeURIComponent(f.name)}`);
      load(bucket, meta?.page || 1, search);
    } catch (e: any) {
      alert(e.response?.data?.message || e.message);
    }
  }

  async function copyUrl(f: FileRow) {
    if (!f.url) return;
    try {
      await navigator.clipboard.writeText(f.url);
      setCopied(f.name);
      setTimeout(() => setCopied(''), 1500);
    } catch {}
  }

  const files = meta?.data || [];
  const filtered = search ? files.filter((f) => f.name.toLowerCase().includes(search.toLowerCase())) : files;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="card">
        <div className="card-head" style={{ flexWrap: 'wrap' }}>
          <div>
            <h3>Storage Browser</h3>
            <div style={{ fontSize: 12, color: '#64748B' }}>
              Supabase Storage buckets • signed URLs expire in 1h • deletes are audited
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="input" style={{ width: 220 }} value={bucket} onChange={(e) => setBucket(e.target.value)}>
              {BUCKETS.map((b) => (
                <option key={b} value={b}>
                  {b}{b === 'profiles' || b === 'community_posts' ? ' (public)' : ' (private)'}
                </option>
              ))}
            </select>
            <SearchInput value={search} onChange={setSearch} placeholder="Filter file names…" />
            <button className="btn btn-ghost" onClick={() => load()} disabled={loading}>
              ↻ Refresh
            </button>
          </div>
        </div>
        <div style={{ padding: '10px 16px', display: 'flex', gap: 8, alignItems: 'center', borderBottom: '1px solid #F1F5F9' }}>
          <span className="kbd">{bucket}</span>
          {meta?.public ? <Badge tone="success">public</Badge> : <Badge tone="warning">private</Badge>}
          <span style={{ fontSize: 12, color: '#64748B' }}>{filtered.length} files showed (server total {meta?.total ?? 0})</span>
        </div>
        {err && <div style={{ margin: 12, padding: 10, background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', borderRadius: 10, fontSize: 13 }}>{err}</div>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Size</th>
                <th>Type</th>
                <th>Updated</th>
                <th style={{ width: 220 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: 24, color: '#64748B' }}>
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <Empty title="No files" desc={`${bucket} bucket is empty or matches no filter.`} />
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((f) => (
                  <tr key={f.name}>
                    <td style={{ wordBreak: 'break-all' }}>
                      <span className="kbd" style={{ fontSize: 11 }}>{f.name}</span>
                      {copied === f.name && <Badge tone="success" >copied URL</Badge>}
                    </td>
                    <td>{fmtSize(f.size)}</td>
                    <td style={{ fontSize: 12, color: '#64748B' }}>{f.mimetype || '—'}</td>
                    <td style={{ fontSize: 12 }}>{f.updatedAt ? new Date(f.updatedAt).toLocaleString() : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <a className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }} href={f.url || '#'} target="_blank" rel="noreferrer" onClick={(e) => !f.url && e.preventDefault()}>
                          Open
                        </a>
                        <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => copyUrl(f)}>
                          Copy URL
                        </button>
                        <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12, color: '#DC2626', borderColor: '#FECACA' }} onClick={() => del(f)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {meta && <Pagination page={meta.page} totalPages={meta.totalPages} total={meta.total} onPage={(p) => load(bucket, p, search)} />}
        </div>
        <div style={{ padding: '8px 12px', fontSize: 11, color: '#94A3B8' }}>
          Allowed buckets: {BUCKETS.join(', ')} • uploads happen client-side via <code>POST /storage/upload</code> (auth) — this browser is admin delete/view only.
        </div>
      </div>
    </div>
  );
}