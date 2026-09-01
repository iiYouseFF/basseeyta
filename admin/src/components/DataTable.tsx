import React from 'react';

export function Pagination({
  page,
  totalPages,
  total,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (p: number) => void;
}) {
  return (
    <div className="pagination">
      <div style={{ fontSize: 12, color: '#64748B' }}>
        Total <strong style={{ color: '#1E293B' }}>{total}</strong> — Page <strong>{page}</strong> of <strong>{totalPages || 1}</strong>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn-ghost" style={{ padding: '6px 10px' }} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Prev
        </button>
        <button className="btn btn-ghost" style={{ padding: '6px 10px' }} disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="search-box" style={{ flex: 1, minWidth: 220 }}>
      <span className="s-ico">⌕</span>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || 'Search…'} />
    </div>
  );
}

export function Badge({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'success' | 'warning' | 'error' | 'info' | 'muted' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Empty({ title, desc, action }: { title: string; desc?: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {desc && <div style={{ fontSize: 13, marginTop: 4 }}>{desc}</div>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <strong style={{ fontSize: 14 }}>{title}</strong>
          <button className="btn btn-ghost" style={{ padding: '4px 8px' }} onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
