// TestRunner — developer tool for batch-testing ScamShield's on-device accuracy.
//
// Steps before the first test message:
//   1. Warm-up: warmUpDeviceModel() — creates the Chrome session, records warm-up time.
//
// Timing reported:
//   - Warm-up time (session creation + tiny inference)
//   - First-run time (message #1 — often slower as the model settles)
//   - Average time for messages #2–N (steady-state performance)
//
// `expected` may be a string or an array of acceptable verdicts.
// `expectedCategory` may also be an array for ambiguous test cases.
//
// False positives (FP): safe message marked scam/suspicious
// False negatives (FN): scam message marked safe

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
  const [exportText, setExportText] = useState('');

  async function runTests() {
    setStatus(STATUS.warming);
    setRows([]);
    setWarmupMs(null);
    setError('');
    setExportText('');

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

        const verdictMatch = Array.isArray(msg.expected)
          ? msg.expected.includes(result.verdict)
          : result.verdict === msg.expected;

        const categoryMatch = Array.isArray(msg.expectedCategory)
          ? msg.expectedCategory.includes(result.category)
          : result.category === msg.expectedCategory;

        // FP: a safe message was flagged as scam or suspicious
        const expectedIsSafe = Array.isArray(msg.expected)
          ? msg.expected.every((e) => e === 'safe')
          : msg.expected === 'safe';
        const isFP = expectedIsSafe && (result.verdict === 'scam' || result.verdict === 'suspicious');

        // FN: a scam message was classified as safe
        const expectedIsScam = Array.isArray(msg.expected)
          ? msg.expected.some((e) => e === 'scam' || e === 'suspicious')
          : (msg.expected === 'scam' || msg.expected === 'suspicious');
        const isFN = expectedIsScam && result.verdict === 'safe';

        row = {
          id: msg.id,
          label: msg.label,
          expected: Array.isArray(msg.expected) ? msg.expected.join('/') : msg.expected,
          actual: result.verdict,
          expectedCategory: Array.isArray(msg.expectedCategory)
            ? msg.expectedCategory.join('/')
            : msg.expectedCategory,
          actualCategory: result.category,
          confidence: result.confidence,
          verdictMatch,
          categoryMatch,
          isFP,
          isFN,
          durationMs: result.durationMs ?? elapsed,
          error: null,
        };
      } catch (err) {
        row = {
          id: msg.id,
          label: msg.label,
          expected: Array.isArray(msg.expected) ? msg.expected.join('/') : msg.expected,
          actual: '—',
          expectedCategory: Array.isArray(msg.expectedCategory)
            ? msg.expectedCategory.join('/')
            : msg.expectedCategory,
          actualCategory: '—',
          confidence: '—',
          verdictMatch: false,
          categoryMatch: false,
          isFP: false,
          isFN: false,
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
  const fpCount = rows.filter((r) => r.isFP).length;
  const fnCount = rows.filter((r) => r.isFN).length;
  const verdictAccuracy = totalDone > 0 ? Math.round((verdictCorrect / totalDone) * 100) : null;

  const firstRunMs = rows[0]?.durationMs ?? null;
  const restRows = rows.slice(1).filter((r) => !r.error);
  const avgRestMs = restRows.length > 0
    ? Math.round(restRows.reduce((s, r) => s + r.durationMs, 0) / restRows.length)
    : null;

  const isRunning = status === STATUS.running || status === STATUS.warming;

  // ── Export to markdown ─────────────────────────────────────────────────────
  function handleExport() {
    const lines = [
      `## ScamShield Eval Results`,
      ``,
      `| # | Label | Expected | Actual | Category | Conf | Time |`,
      `|---|-------|----------|--------|----------|------|------|`,
    ];

    for (const r of rows) {
      const v = r.verdictMatch ? '✓' : r.error ? 'ERR' : '✗';
      const c = r.categoryMatch ? '✓' : r.error ? '—' : '✗';
      lines.push(
        `| ${r.id} | ${r.label} | ${r.expected} | ${r.actual} ${v} | ${r.actualCategory} ${c} | ${r.confidence} | ${r.durationMs.toLocaleString()} ms |`
      );
    }

    lines.push(``);
    lines.push(`**Verdict accuracy:** ${verdictAccuracy}% (${verdictCorrect}/${totalDone})`);
    lines.push(`**Category accuracy:** ${categoryCorrect}/${totalDone}`);
    lines.push(`**False positives:** ${fpCount}`);
    lines.push(`**False negatives:** ${fnCount}`);
    if (warmupMs != null) lines.push(`**Warm-up:** ${warmupMs.toLocaleString()} ms`);
    if (firstRunMs != null) lines.push(`**First run:** ${firstRunMs.toLocaleString()} ms`);
    if (avgRestMs != null) lines.push(`**Avg (runs 2–${totalDone}):** ${avgRestMs.toLocaleString()} ms`);

    setExportText(lines.join('\n'));
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <h3 style={styles.title}>Scam Check Test Runner</h3>
        <div style={styles.headerRight}>
          {status === STATUS.done && (
            <span style={styles.accuracy}>
              {verdictAccuracy}% verdict ({verdictCorrect}/{totalDone})
              {' · '}FP: {fpCount} · FN: {fnCount}
            </span>
          )}
          {status === STATUS.done && (
            <button
              style={styles.exportBtn}
              onClick={handleExport}
              type="button"
            >
              Export
            </button>
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
                <th style={styles.th}>Conf</th>
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
                    {row.isFP && <span style={styles.fpTag} title="False positive"> FP</span>}
                    {row.isFN && <span style={styles.fnTag} title="False negative"> FN</span>}
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

      {/* Export textarea */}
      {exportText && (
        <div style={styles.exportWrap}>
          <div style={styles.exportLabel}>Copy and paste into docs/eval-baseline.md or docs/eval-v2.md:</div>
          <textarea
            style={styles.exportArea}
            value={exportText}
            readOnly
            onClick={(e) => e.target.select()}
            rows={Math.min(exportText.split('\n').length + 1, 20)}
          />
        </div>
      )}
    </div>
  );
}

function VerdictPill({ v, match }) {
  // Handle "safe/suspicious" combined strings from array expected
  const base = typeof v === 'string' ? v.split('/')[0] : v;
  const colors = {
    scam:       { bg: '#fee2e2', text: '#991b1b' },
    suspicious: { bg: '#fef3c7', text: '#92400e' },
    safe:       { bg: '#dcfce7', text: '#166534' },
  };
  const c = colors[base] ?? { bg: '#f3f4f6', text: '#6b7280' };
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
    gap: 8,
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
  exportBtn: {
    padding: '7px 12px',
    fontSize: '0.82rem',
    fontWeight: 600,
    background: '#f3f4f6',
    color: '#374151',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: 'inherit',
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
  fpTag: { fontSize: '0.72rem', color: '#dc2626', fontWeight: 700 },
  fnTag: { fontSize: '0.72rem', color: '#9a3412', fontWeight: 700 },
  exportWrap: {
    marginTop: 16,
  },
  exportLabel: {
    fontSize: '0.78rem',
    color: '#6b7280',
    marginBottom: 6,
  },
  exportArea: {
    width: '100%',
    fontFamily: 'monospace',
    fontSize: '0.75rem',
    padding: '10px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    background: '#f9fafb',
    resize: 'vertical',
    boxSizing: 'border-box',
  },
};
