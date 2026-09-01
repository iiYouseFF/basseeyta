import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Badge, Empty, Pagination } from '../components/DataTable';

type AiRow = { id: string; userId: string; governorate: string; query: string; reply: string; mock: boolean; error?: string | null; createdAt: string };
type Totals = { total: number; today: number; month: number; mockToday: number; mockMonth: number };

export default function AiUsage() {
  const [data, setData] = useState<AiRow[]>([]);
  const [totals, setTotals] = useState<Totals>({ total: 0, today: 0, month: 0, mockToday: 0, mockMonth: 0 });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function load(p = page) {
    setLoading(true);
    setErr('');
    try {
      const r = await api.get('/admin/api/ai-usage', { params: { page: p, limit: 20 } });
      setData(r.data.data || []);
      setTotal(r.data.total ?? 0);
      setTotalPages(r.data.totalPages ?? 1);
      setPage(r.data.page ?? p);
      setTotals(r.data.totals || totals);
    } catch (e: any) {
      setErr(e.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="grid grid-4">
        <div className="card stat">
          <div className="stat-top">
            <div>
              <div className="stat-label">All time</div>
              <div className="stat-value">{totals.total}</div>
              <div className="stat-sub">AI assistant calls</div>
            </div>
            <div className="stat-ico blue">≋</div>
          </div>
        </div>
        <div className="card stat">
          <div className="stat-top">
            <div>
              <div className="stat-label">Today</div>
              <div className="stat-value">{totals.today}</div>
              <div className="stat-sub">{totals.mockToday} mock fallback</div>
            </div>
            <div className="stat-ico green">◷</div>
          </div>
        </div>
        <div className="card stat">
          <div className="stat-top">
            <div>
              <div className="stat-label">This month</div>
              <div className="stat-value">{totals.month}</div>
              <div className="stat-sub">{totals.mockMonth} mock fallback</div>
            </div>
            <div className="stat-ico amber">↗</div>
          </div>
        </div>
        <div className="card stat">
          <div className="stat-top">
            <div>
              <div className="stat-label">Mock rate</div>
              <div className="stat-value">{totals.total ? Math.round((totals.mockMonth / Math.max(1, totals.month)) * 100) : 0}%</div>
              <div className="stat-sub">of this month (no API key)</div>
            </div>
            <div className="stat-ico slate">⅒</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head" style={{ flexWrap: 'wrap' }}>
          <div>
            <h3>AI Usage Log</h3>
            <div style={{ fontSize: 12, color: '#64748B' }}>Every assistant query/reply is logged — real (OpenAI) vs mock (no key)</div>
          </div>
          <button className="btn btn-ghost" onClick={() => load(page)} disabled={loading}>
            ↻ Refresh
          </button>
        </div>
        {err && <div style={{ margin: 12, padding: 10, background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', borderRadius: 10, fontSize: 13 }}>{err}</div>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>User</th>
                <th>Gov</th>
                <th>Query</th>
                <th>Reply</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#64748B' }}>
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && data.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <Empty title="No AI calls yet" desc="All usage appears here once the assistant is used." />
                  </td>
                </tr>
              )}
              {!loading &&
                data.map((a) => (
                  <tr key={a.id}>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{new Date(a.createdAt).toLocaleString()}</td>
                    <td>
                      <span className="kbd">{a.userId ? a.userId.slice(0, 10) + '…' : 'anon'}</span>
                    </td>
                    <td style={{ fontSize: 12 }}>{a.governorate || '—'}</td>
                    <td style={{ maxWidth: 260, wordBreak: 'break-word', fontSize: 13 }}>{a.query}</td>
                    <td style={{ maxWidth: 320, wordBreak: 'break-word', fontSize: 12, color: '#475569' }}>{a.reply}</td>
                    <td>
                      {a.mock ? <Badge tone="warning">mock</Badge> : <Badge tone="success">openai</Badge>}
                      {a.error && <div style={{ fontSize: 11, color: '#DC2626', marginTop: 2 }}>err</div>}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} total={total} onPage={load} />
        </div>
      </div>
    </div>
  );
}