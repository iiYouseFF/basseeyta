import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Badge, Empty } from '../components/DataTable';

type Job = { name: string; schedule: string; purpose: string; workers: boolean; lastRunAt: string | null; lastStatus: string; runs: number; lastDetail?: any };

const statusTone = (s: string): any => (s === 'ok' ? 'success' : s === 'queued' ? 'info' : s === 'error' ? 'error' : 'muted');
const statusLabel = (s: string) => (s === 'never' ? 'never run' : s);

export default function Jobs() {
  const [data, setData] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [running, setRunning] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr('');
    try {
      const r = await api.get('/admin/api/jobs');
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

  async function run(name: string) {
    if (!confirm(`Run job "${name}" now? Progress is audited.`)) return;
    setRunning(name);
    try {
      await api.post(`/admin/api/jobs/${encodeURIComponent(name)}/run`);
      load();
    } catch (e: any) {
      alert(e.response?.data?.message || e.message);
    } finally {
      setRunning(null);
    }
  }

  const counts = data.reduce(
    (acc, j) => {
      acc[j.lastStatus] = (acc[j.lastStatus] || 0) + 1;
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
              <div className="stat-label">Jobs</div>
              <div className="stat-value">{data.length}</div>
              <div className="stat-sub">registered cron jobs</div>
            </div>
            <div className="stat-ico blue">⚙</div>
          </div>
        </div>
        <div className="card stat">
          <div className="stat-top">
            <div>
              <div className="stat-label">OK runs</div>
              <div className="stat-value">{counts['ok'] || 0}</div>
              <div className="stat-sub">last run succeeded</div>
            </div>
            <div className="stat-ico green">✓</div>
          </div>
        </div>
        <div className="card stat">
          <div className="stat-top">
            <div>
              <div className="stat-label">Never run</div>
              <div className="stat-value">{data.filter((j) => j.lastStatus === 'never').length}</div>
              <div className="stat-sub">needs first trigger</div>
            </div>
            <div className="stat-ico amber">⊘</div>
          </div>
        </div>
        <div className="card stat">
          <div className="stat-top">
            <div>
              <div className="stat-label">Failures</div>
              <div className="stat-value">{counts['error'] || 0}</div>
              <div className="stat-sub">last run errored</div>
            </div>
            <div className="stat-ico rose">✕</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head" style={{ flexWrap: 'wrap' }}>
          <div>
            <h3>Jobs / Cron Monitor</h3>
            <div style={{ fontSize: 12, color: '#64748B' }}>
              Scheduled maintenance jobs • also triggerable via <code className="kbd">POST /jobs/:name</code> (cron secret)
            </div>
          </div>
          <button className="btn btn-ghost" onClick={load} disabled={loading}>
            ↻ Refresh
          </button>
        </div>
        {err && <div style={{ margin: 12, padding: 10, background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', borderRadius: 10, fontSize: 13 }}>{err}</div>}
        <div className="table-wrap">
          {!loading && data.length === 0 ? (
            <Empty title="No jobs" desc="Backend job registry is empty." />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Schedule</th>
                  <th>Purpose</th>
                  <th>Last run</th>
                  <th>Status</th>
                  <th>Runs</th>
                  <th style={{ width: 110 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(loading ? [] : data).map((j) => (
                  <tr key={j.name}>
                    <td>
                      <span className="kbd">{j.name}</span>
                      {!j.workers && <span className="badge badge-muted" style={{ marginLeft: 6 }}>no queue</span>}
                    </td>
                    <td style={{ fontSize: 12 }}>{j.schedule}</td>
                    <td style={{ fontSize: 12, color: '#475569' }}>{j.purpose}</td>
                    <td style={{ fontSize: 12 }}>{j.lastRunAt ? new Date(j.lastRunAt).toLocaleString() : '—'}</td>
                    <td>
                      <Badge tone={statusTone(j.lastStatus)}>{statusLabel(j.lastStatus)}</Badge>
                      {j.lastDetail && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{JSON.stringify(j.lastDetail)}</div>}
                    </td>
                    <td>{j.runs}</td>
                    <td>
                      <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => run(j.name)} disabled={running === j.name}>
                        {running === j.name ? 'Running…' : 'Run now'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div style={{ padding: '8px 12px', fontSize: 11, color: '#94A3B8' }}>
          In-memory developer mode executes synchronously; with Redis, jobs are queued to BullMQ workers. All runs are recorded in <code>store.jobRuns</code> and audited.
        </div>
      </div>
    </div>
  );
}