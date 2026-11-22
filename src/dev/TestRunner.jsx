// TestRunner — developer tool for batch-testing ScamShield's on-device accuracy.
//
// Steps before the first test message:
//   1. Warm-up: warmUpDeviceModel() — creates the Chrome session, records warm-up time.
//
// Timing reported:
//   - Warm-up time (session creation + tiny inference)
//   - First-run time (message #1 — often slower as the model settles in memory)
//   - Average time for messages #2-14 (represents steady-state performance)
//
// Uses onDeviceCheck() directly (no routing overhead per test).

import { useState } from 'react';
import { onDeviceCheck, warmUpDeviceModel } from '../ai/checkMessage';
import { TEST_MESSAGES } from './testMessages';

const STATUS = { idle: 'idle', warming: 'warming', running: 'running', done: 'done' };

export default function TestRunner() {
  const [status, setStatus] = useState(STATUS.idle);
  const [rows, setRows] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [warmupMs, setWarmupMs] = useState(null);
  const [error, setError] = useState('');

  async function runTests() {
    setStatus(STATUS.warming);
    setRows([]);
    setWarmupMs(null);
    setError('');

    // ── Warm-up step ──────────────────────────────────────────────────────────
    const warmStart = Date.now();
    try {
      await warmUpDeviceModel();
    } catch {
      // warmUpDeviceModel swallows errors internally; this is belt-and-suspenders
    }
    setWarmupMs(Date.now() - warmStart);

    // ── Run tests ─────────────────────────────────────────────────────────────
    setStatus(STATUS.running);
    const results = [];

    for (let i = 0; i < TEST_MESSAGES.length; i++) {
      const msg = TEST_MESSAGES[i];
      setCurrentIndex(i);

      let row;
      const start = Date.now();
      try {
        const result = await onDeviceCheck(msg.text);
        const elapsed = Date.now() - start;
        const verdictMatch = result.verdict === msg.expected;
        const categoryMatch = result.category === msg.expectedCategory;
        row = {
          id: msg.id,
          label: msg.label,
          expected: msg.expected,
          actual: result.verdict,
          expectedCategory: msg.expectedCategory,
          actualCategory: result.category,
          confidence: result.confidence,
          verdictMatch,
          categoryMatch,
          durationMs: result.durationMs ?? elapsed,
          error: null,
        };
      } catch (err) {
        row = {
          id: msg.id,
          label: msg.label,
          expected: msg.expected,
          actual: '—',
          expectedCategory: msg.expectedCategory,
          actualCategory: '—',
          confidence: '—',
          verdictMatch: false,
          categoryMatch: false,
          durationMs: Date.now() - start,
          error: err?.message ?? String(err),
        };
      }

      results.push(row);
      setRows([...results]);
    }

    setStatus(STATUS.done);
    setCurrentIndex(-1);
  }

  // ── Summary stats ──────────────────────────────────────────────────────────
  const verdictCorrect = rows.filter((r) => r.verdictMatch).length;
  const categoryCorrect = rows.filter((r) => r.categoryMatch && !r.error).length;
  const totalDone = rows.length;
  const verdictAccuracy = totalDone > 0 ? Math.round((verdictCorrect / totalDone) * 100) : null;

  const firstRunMs = rows[0]?.durationMs ?? null;
  const restRows = rows.slice(1).filter((r) => !r.error);
  const avgRestMs = restRows.length > 0
    ? Math.round(restRows.reduce((s, r) => s + r.durationMs, 0) / restRows.length)
    : null;

  const isRunning = status === STATUS.running || status === STATUS.warming;

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <h3 style={styles.title}>Scam Check Test Runner</h3>
        <div style={styles.headerRight}>
          {status === STATUS.done && (
            <span style={styles.accuracy}>
              {verdictAccuracy}% verdict ({verdictCorrect}/{totalDone})
              {' · '}
              {categoryCorrect}/{totalDone} category
            </span>
          )}
          <button
            style={{ ...styles.runBtn, ...(isRunning ? styles.runBtnDisabled : {}) }}
            onClick={runTests}
            disabled={isRunning}
            type="button"
          >
            {status === STATUS.warming
              ? 'Warming up…'
              : status === STATUS.running
              ? `Running ${currentIndex + 1} / ${TEST_MESSAGES.length}…`
              : status === STATUS.done
              ? 'Run again'
              : 'Run all tests'}
          </button>
        </div>
      </div>

      {/* Timing summary */}
      {status === STATUS.done && (warmupMs != null || firstRunMs != null) && (
        <div style={styles.timingSummary}>
          {warmupMs != null && (
            <span style={styles.timingPill}>Warm-up: {warmupMs.toLocaleString()} ms</span>
          )}
          {firstRunMs != null && (
            <span style={styles.timingPill}>First run: {firstRunMs.toLocaleString()} ms</span>
          )}
          {avgRestMs != null && (
            <span style={styles.timingPill}>Avg (runs 2–{totalDone}): {avgRestMs.toLocaleString()} ms</span>
          )}
        </div>
      )}

      {error && <p style={styles.errorMsg}>{error}</p>}

      {rows.length > 0 && (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>#</th>
                <th style={styles.th}>Label</th>
                <th style={styles.th}>Expected</th>
                <th style={styles.th}>Actual</th>
                <th style={styles.th}>Category match</th>
                <th style={styles.th}>Confidence</th>
                <th style={styles.th}>Time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  style={row.error
                    ? styles.rowError
                    : row.verdictMatch ? styles.rowPass : styles.rowFail}
                >
                  <td style={styles.td}>{row.id}</td>
                  <td style={{ ...styles.td, ...styles.tdLabel }}>{row.label}</td>
                  <td style={styles.td}><VerdictPill v={row.expected} /></td>
                  <td style={styles.td}>
                    {row.error
                      ? <span style={styles.errorCell} title={row.error}>ERR</span>
                      : <VerdictPill v={row.actual} match={row.verdictMatch} />}
                  </td>
                  <td style={styles.td}>
                    <span style={row.categoryMatch ? styles.categoryPass : styles.categoryFail}>
                      {row.categoryMatch ? 'Yes' : row.error ? '—' : 'No'}
                    </span>
                    {!row.categoryMatch && !row.error && (
                      <span style={styles.categoryActual}> ({row.actualCategory})</span>
                    )}
                  </td>
                  <td style={styles.td}>{row.confidence}</td>
                  <td style={{ ...styles.td, ...(row.id === 1 ? styles.firstRunCell : {}) }}>
                    {row.durationMs.toLocaleString()} ms
                    {row.id === 1 && <span style={styles.firstRunTag}> first</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function VerdictPill({ v, match }) {
  const colors = {
    scam:       { bg: '#fee2e2', text: '#991b1b' },
    suspicious: { bg: '#fef3c7', text: '#92400e' },
    safe:       { bg: '#dcfce7', text: '#166534' },
  };
  const c = colors[v] ?? { bg: '#f3f4f6', text: '#6b7280' };
  const outline = match === false ? '2px solid #ef4444' : match === true ? '2px solid #22c55e' : 'none';
  return (
    <span style={{
      display: 'inline-block',
      background: c.bg,
      color: c.text,
      fontSize: '0.75rem',
      fontWeight: 700,
      padding: '2px 8px',
      borderRadius: 99,
      outline,
    }}>
      {v}
    </span>
  );
}

const styles = {
  wrap: {
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: 20,
    marginTop: 16,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  title: {
    margin: 0,
    fontSize: '0.95rem',
    fontWeight: 600,
    color: '#374151',
  },
  accuracy: {
    fontSize: '0.82rem',
    color: '#374151',
    fontWeight: 600,
  },
  runBtn: {
    padding: '7px 16px',
    fontSize: '0.875rem',
    fontWeight: 600,
    background: '#374151',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },
  runBtnDisabled: {
    background: '#9ca3af',
    cursor: 'not-allowed',
  },
  timingSummary: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  timingPill: {
    fontSize: '0.78rem',
    background: '#e0f2fe',
    color: '#0369a1',
    padding: '3px 10px',
    borderRadius: 99,
    fontWeight: 600,
  },
  errorMsg: {
    color: '#dc2626',
    fontSize: '0.875rem',
    marginBottom: 12,
  },
  tableWrap: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.82rem',
  },
  th: {
    padding: '7px 10px',
    textAlign: 'left',
    fontWeight: 600,
    color: '#6b7280',
    borderBottom: '1px solid #e5e7eb',
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '8px 10px',
    borderBottom: '1px solid #f3f4f6',
    verticalAlign: 'middle',
  },
  tdLabel: {
    maxWidth: 220,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  rowPass: { background: '#f0fdf4' },
  rowFail: { background: '#fef2f2' },
  rowError: { background: '#fffbeb' },
  categoryPass: { color: '#166534', fontWeight: 600 },
  categoryFail: { color: '#dc2626', fontWeight: 600 },
  categoryActual: { color: '#6b7280', fontSize: '0.75rem' },
  errorCell: { color: '#dc2626', fontWeight: 600, cursor: 'help' },
  firstRunCell: { fontWeight: 600 },
  firstRunTag: { fontSize: '0.72rem', color: '#6b7280', fontWeight: 400 },
};
