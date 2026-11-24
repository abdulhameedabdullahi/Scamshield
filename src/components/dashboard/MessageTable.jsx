// Per-message results table with type filters.
// Columns: #, Label, Expected, Preview, AI only, Rules+AI, Cloud.
// On narrow screens the table scrolls horizontally.

import { useState } from 'react';

export default function MessageTable({ messages }) {
  const [filter, setFilter] = useState('all');

  if (!messages || messages.length === 0) return null;

  const counts = {
    all:  messages.length,
    scam: messages.filter((m) => m.type === 'scam').length,
    safe: messages.filter((m) => m.type === 'safe').length,
  };
  const visible = filter === 'all' ? messages : messages.filter((m) => m.type === filter);

  return (
    <div>
      {/* Filter row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {[['all', 'All'], ['scam', 'Scams'], ['safe', 'Safe']].map(([f, label]) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            style={{
              padding: '4px 14px',
              fontSize: '0.8rem',
              fontWeight: filter === f ? 700 : 400,
              background: filter === f ? '#1d4ed8' : '#f3f4f6',
              color: filter === f ? '#fff' : '#374151',
              border: `1px solid ${filter === f ? '#1d4ed8' : '#d1d5db'}`,
              borderRadius: 99,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {label} ({counts[f] ?? 0})
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr>
              <th style={TH}>#</th>
              <th style={TH}>Label</th>
              <th style={TH}>Expected</th>
              <th style={{ ...TH, maxWidth: 160 }}>Preview</th>
              <th style={TH}>AI only</th>
              <th style={{ ...TH, color: '#1d4ed8' }}>Rules + AI ★</th>
              <th style={TH}>Cloud</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((msg) => <Row key={msg.id} msg={msg} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ msg }) {
  const bg = { scam: '#fff9f9', safe: '#f6fef9', ambiguous: '#fffef5' };
  return (
    <tr style={{ background: bg[msg.type] ?? '#fff', borderBottom: '1px solid #f3f4f6' }}>
      <td style={TD}>{msg.id}</td>
      <td style={{ ...TD, whiteSpace: 'nowrap', maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {msg.label}
      </td>
      <td style={TD}><Pill v={msg.expected} /></td>
      <td style={{ ...TD, maxWidth: 160, fontSize: '0.72rem', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {msg.preview}
      </td>
      <td style={TD}><ResultCell r={msg.results?.aiOnly} /></td>
      <td style={TD}><ResultCell r={msg.results?.rulesAi} highlight /></td>
      <td style={TD}><ResultCell r={msg.results?.cloud} /></td>
    </tr>
  );
}

function ResultCell({ r, highlight }) {
  if (r == null) return <span style={{ color: '#d1d5db', fontSize: '0.75rem' }}>—</span>;
  if (r.error) {
    return (
      <span
        style={{ color: '#d97706', fontWeight: 600, fontSize: '0.75rem', cursor: 'help', borderBottom: '1px dotted #d97706' }}
        title={r.error}
        aria-label={`Error: ${r.error}`}
      >
        Error
      </span>
    );
  }
  const ok = r.correct;
  return (
    <span style={{ color: ok ? '#166534' : '#dc2626', fontWeight: highlight ? 700 : 600, fontSize: '0.82rem' }}>
      {ok ? '✓' : '✗'} {r.verdict ?? '—'}
    </span>
  );
}

function Pill({ v }) {
  const base = typeof v === 'string' ? v.split('/')[0] : String(v);
  const map = {
    scam:       { bg: '#fee2e2', text: '#991b1b' },
    suspicious: { bg: '#fef3c7', text: '#92400e' },
    safe:       { bg: '#dcfce7', text: '#166534' },
  };
  const c = map[base] ?? { bg: '#f3f4f6', text: '#6b7280' };
  return (
    <span style={{ display: 'inline-block', background: c.bg, color: c.text, fontSize: '0.72rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99 }}>
      {v}
    </span>
  );
}

const TH = {
  padding: '8px 10px',
  textAlign: 'left',
  fontWeight: 600,
  color: '#6b7280',
  borderBottom: '1px solid #e5e7eb',
  whiteSpace: 'nowrap',
  background: '#f9fafb',
};
const TD = {
  padding: '7px 10px',
  borderBottom: '1px solid #f3f4f6',
  verticalAlign: 'middle',
};
