import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { ENTITIES } from '../lib/entities.tsx';
import { Badge, Empty, Modal, Pagination, SearchInput } from '../components/DataTable';

export default function GenericList({ entityKey }: { entityKey: string }) {
  const cfg = ENTITIES[entityKey];
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  async function load(p = page, s = search, f = filter) {
    setLoading(true);
    setErr('');
    try {
      const params: any = { page: p, limit, search: s || undefined, ...f };
      // clean empty
      Object.keys(params).forEach((k) => params[k] === '' && delete params[k]);
      const r = await api.get(`/admin/api/${cfg.path}`, { params });
      const body = r.data;
      setData(body.data || []);
      setTotal(body.total ?? body.data?.length ?? 0);
      setTotalPages(body.totalPages ?? 1);
      setPage(body.page ?? p);
    } catch (e: any) {
      setErr(e.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(1, search, filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityKey]);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => load(1, search, filter), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function openEdit(row: any) {
    setEditing(row);
    const init: any = {};
    (cfg.editableFields || []).forEach((f) => {
      // map camel to store keys: try both
      const raw = row[f.key] ?? row[f.key.replace(/([A-Z])/g, '_$1').toLowerCase()] ?? '';
      init[f.key] = raw;
    });
    // special handling for boolean as string
    (cfg.editableFields || []).forEach((f) => {
      if (f.type === 'select' && (f.options?.includes('true') || f.options?.includes('false'))) {
        const v = init[f.key];
        init[f.key] = String(v);
      }
    });
    setForm(init);
  }

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    try {
      const id = editing.id || editing.phone || editing.code || editing.user_id || editing._id;
      // coerce numbers/booleans
      const payload: any = { ...form };
      (cfg.editableFields || []).forEach((f) => {
        if (f.type === 'number' && payload[f.key] !== '' && payload[f.key] != null) payload[f.key] = Number(payload[f.key]);
        if (f.type === 'select' && (f.options?.includes('true') || f.options?.includes('false'))) {
          if (payload[f.key] === 'true') payload[f.key] = true;
          if (payload[f.key] === 'false') payload[f.key] = false;
        }
      });
      await api.patch(`/admin/api/${cfg.path}/${encodeURIComponent(id)}`, payload);
      setEditing(null);
      load(page, search, filter);
    } catch (e: any) {
      alert(e.response?.data?.message || e.message);
    } finally {
      setSaving(false);
    }
  }

  async function delRow(row: any) {
    if (!confirm(`Delete ${cfg.label} ${row.id || row.phone || row.code || ''}? This is audited and cannot be undone.`)) return;
    const id = row.id || row.phone || row.code;
    try {
      await api.delete(`/admin/api/${cfg.path}/${encodeURIComponent(id)}`);
      load(page, search, filter);
    } catch (e: any) {
      alert(e.response?.data?.message || e.message);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="card">
        <div className="card-head" style={{ flexWrap: 'wrap' }}>
          <div>
            <h3>{cfg.label}</h3>
            <div style={{ fontSize: 12, color: '#64748B' }}>
              <code>/admin/{cfg.path}</code> • per-field whitelist • audited
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <SearchInput value={search} onChange={setSearch} placeholder={`Search ${cfg.label.toLowerCase()}…`} />
            {cfg.filters?.map((f) => (
              <select key={f.key} className="input" style={{ width: 160 }} value={filter[f.key] || ''} onChange={(e) => { const nf = { ...filter, [f.key]: e.target.value }; setFilter(nf); load(1, search, nf); }}>
                <option value="">{f.label}: all</option>
                {f.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ))}
            <button className="btn btn-ghost" onClick={() => load(page, search, filter)} disabled={loading}>
              ↻ Refresh
            </button>
          </div>
        </div>

        {err && <div style={{ margin: 12, padding: 10, background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', borderRadius: 10, fontSize: 13 }}>{err}</div>}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {cfg.columns.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
                <th style={{ width: 140 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={cfg.columns.length + 1} style={{ textAlign: 'center', padding: 24, color: '#64748B' }}>
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && data.length === 0 && (
                <tr>
                  <td colSpan={cfg.columns.length + 1}>
                    <Empty title="No records" desc={`No ${cfg.label.toLowerCase()} match your filters.`} />
                  </td>
                </tr>
              )}
              {!loading &&
                data.map((row: any) => (
                  <tr key={row.id || row.phone || row.code || Math.random()}>
                    {cfg.columns.map((c) => {
                      const v = row[c.key] ?? row[c.key.replace(/([A-Z])/g, '_$1').toLowerCase()] ?? '';
                      const rendered = c.render ? c.render(v, row) : (v ?? '—');
                      // status badges
                      if (c.key === 'status') {
                        const tone = v === 'pending' ? 'warning' : v === 'approved' || v === 'completed' || v === 'paid' || v === 'accepted' ? 'success' : v === 'rejected' || v === 'cancelled' || v === 'expired' ? 'error' : 'muted';
                        return (
                          <td key={c.key}>
                            <Badge tone={tone as any}>{v || '—'}</Badge>
                          </td>
                        );
                      }
                      return <td key={c.key}>{rendered as any}</td>;
                    })}
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {cfg.editableFields && cfg.editableFields.length > 0 && (
                          <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => openEdit(row)}>
                            Edit
                          </button>
                        )}
                        {cfg.deletable && (
                          <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12, color: '#DC2626', borderColor: '#FECACA' }} onClick={() => delRow(row)}>
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} total={total} onPage={(p) => load(p, search, filter)} />
        </div>
        <div style={{ padding: '8px 12px', fontSize: 11, color: '#94A3B8' }}>
          Whitelist: <code>{(cfg.editableFields || []).map((f) => f.key).join(', ') || 'read-only'}</code> — other fields rejected (see `WHITELIST` in `admin.routes.ts`)
        </div>
      </div>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={`Edit ${cfg.label} — ${(editing?.id || editing?.phone || editing?.code || '').slice(0, 12)}`}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </>
        }
      >
        {cfg.editableFields?.map((f) => (
          <div key={f.key}>
            <label className="label">{f.label}</label>
            {f.type === 'select' ? (
              <select className="input" value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                <option value="">— keep —</option>
                {f.options?.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : f.type === 'textarea' ? (
              <textarea className="input" rows={3} value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
            ) : (
              <input className="input" type={f.type === 'number' ? 'number' : 'text'} value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
            )}
          </div>
        ))}
        <div style={{ marginTop: 12, fontSize: 11, color: '#64748B', background: '#F1F5F9', padding: 8, borderRadius: 8 }}>
          Only whitelisted fields are sent. Server rejects others: <code>PATCH /admin/{cfg.path}/:id</code>
        </div>
      </Modal>
    </div>
  );
}
