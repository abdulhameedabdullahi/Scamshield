// TestRunner — developer tool for comparing three inference modes against the
// 18 synthetic test messages.
//
// Modes:
//   AI only      — on-device, plain prompt, no rules, no post-processing (v1 baseline)
//   Rules + AI   — on-device, full current pipeline
//   Cloud        — cloud via current pipeline + regexMask (consent-bypassed for dev testing)
//
// "Run all modes" runs warm-up once then all three modes in sequence.
// "Run selected" runs just the chosen mode (also warms up for on-device modes).
// When all three modes have results, the comparison view is shown automatically.
// "Export" generates a Markdown report for docs/eval-results.md.

import { useState } from 'react';
import { onDeviceCheck, cloudCheck, warmUpDeviceModel } from '../ai/checkMessage';
import { aiOnlyCheck } from './aiOnlyCheck';
import { TEST_MESSAGES } from './testMessages';

// ── Constants ──────────────────────────────────────────────────────────────────

const MODES = [
  { id: 'ai-only',  label: 'AI only (on-device)',   short: 'AI only'  },
  { id: 'rules-ai', label: 'Rules + AI (on-device)', short: 'Rules+AI' },
  { id: 'cloud',    label: 'Cloud',                  short: 'Cloud'    },
];
const MODE_IDS = MODES.map((m) => m.id);

// ── Helpers ────────────────────────────────────────────────────────────────────

async function checkForMode(modeId, text) {
  if (modeId === 'ai-only') return aiOnlyCheck(text);
  if (modeId === 'rules-ai') return onDeviceCheck(text);
  return cloudCheck(text); // handles regexMask internally
}

function buildRow(msg, result, elapsed) {
  const verdictMatch = Array.isArray(msg.expected)
    ? msg.expected.includes(result.verdict)
    : result.verdict === msg.expected;
  const categoryMatch = Array.isArray(msg.expectedCategory)
    ? msg.expectedCategory.includes(result.category)
    : result.category === msg.expectedCategory;
  // Ambiguous test cases (array expected with both safe+suspicious) are neither FP nor FN
  const isAmbiguous = Array.isArray(msg.expected) && msg.expected.length > 1;
  const expectedIsSafe = !isAmbiguous && (Array.isArray(msg.expected)
    ? msg.expected.every((e) => e === 'safe')
    : msg.expected === 'safe');
  const isFP = !isAmbiguous && expectedIsSafe && result.verdict !== 'safe';
  const isFN = !isAmbiguous && !expectedIsSafe && result.verdict === 'safe';
  return {
    id: msg.id,
    label: msg.label,
    expected: Array.isArray(msg.expected) ? msg.expected.join('/') : msg.expected,
    actual: result.verdict,
    actualCategory: result.category,
    confidence: result.confidence,
    verdictMatch,
    categoryMatch,
    isFP,
    isFN,
    durationMs: result.durationMs ?? elapsed,
    error: null,
  };
}

function buildErrorRow(msg, err, elapsed) {
  return {
    id: msg.id,
    label: msg.label,
    expected: Array.isArray(msg.expected) ? msg.expected.join('/') : msg.expected,
    actual: '—',
    actualCategory: '—',
    confidence: '—',
    verdictMatch: false,
    categoryMatch: false,
    isFP: false,
    isFN: false,
    durationMs: elapsed,
    error: err?.message ?? String(err),
  };
}

function computeStats(rows) {
  if (!rows || rows.length === 0) return null;
  const done = rows.filter((r) => !r.error);
  const correct = rows.filter((r) => r.verdictMatch).length;
  const fp = rows.filter((r) => r.isFP).length;
  const fn = rows.filter((r) => r.isFN).length;
  const firstMs = rows[0]?.durationMs ?? null;
  const rest = rows.slice(1).filter((r) => !r.error);
  const avgMs = rest.length > 0
    ? Math.round(rest.reduce((s, r) => s + r.durationMs, 0) / rest.length)
    : null;
  return {
    total: rows.length,
    correct,
    accuracy: done.length > 0 ? Math.round((correct / done.length) * 100) : 0,
    fp, fn, firstMs, avgMs,
  };
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function TestRunner() {
  const [runStatus, setRunStatus] = useState('idle'); // 'idle'|'warming'|'running'|'done'
  const [currentMode, setCurrentMode] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [warmupMs, setWarmupMs] = useState(null);
  const [modeRows, setModeRows] = useState({}); // { [modeId]: row[] }
  const [selectedMode, setSelectedMode] = useState('rules-ai');
  const [exportText, setExportText] = useState('');

  const isRunning = runStatus === 'warming' || runStatus === 'running';
  const allModesComplete = MODE_IDS.every(
    (id) => modeRows[id] && modeRows[id].length === TEST_MESSAGES.length
  );

  // ── Core run logic ───────────────────────────────────────────────────────────

  async function runModeMessages(modeId) {
    const rows = [];
    for (let i = 0; i < TEST_MESSAGES.length; i++) {
      const msg = TEST_MESSAGES[i];
      setCurrentIndex(i);
      // Small delay between cloud requests to avoid rate limits
      if (modeId === 'cloud' && i > 0) {
        await new Promise((r) => setTimeout(r, 300));
      }
      const start = Date.now();
      try {
        const result = await checkForMode(modeId, msg.text);
        rows.push(buildRow(msg, result, Date.now() - start));
      } catch (err) {
        rows.push(buildErrorRow(msg, err, Date.now() - start));
      }
      setModeRows((prev) => ({ ...prev, [modeId]: [...rows] }));
    }
    return rows;
  }

  async function doWarmup() {
    setRunStatus('warming');
    const warmStart = Date.now();
    try { await warmUpDeviceModel(); } catch { /* warmUpDeviceModel logs internally */ }
    setWarmupMs(Date.now() - warmStart);
  }

  async function handleRunSelected() {
    setExportText('');
    setModeRows((prev) => { const next = { ...prev }; delete next[selectedMode]; return next; });

    if (selectedMode !== 'cloud') {
      await doWarmup();
    }

    setRunStatus('running');
    setCurrentMode(selectedMode);
    await runModeMessages(selectedMode);
    setRunStatus('done');
    setCurrentMode(null);
    setCurrentIndex(-1);
  }

  async function handleRunAll() {
    setExportText('');
    setModeRows({});
    setCurrentMode(null);
    setCurrentIndex(-1);

    // Single warm-up shared across both on-device modes
    await doWarmup();

    for (const modeId of MODE_IDS) {
      setRunStatus('running');
      setCurrentMode(modeId);
      await runModeMessages(modeId);
    }

    setRunStatus('done');
    setCurrentMode(null);
    setCurrentIndex(-1);
  }

  // ── Export ───────────────────────────────────────────────────────────────────

  function handleExport() {
    const lines = ['## ScamShield — Test Suite Results', ''];

    if (warmupMs != null) {
      lines.push(`Warm-up (on-device, shared): ${warmupMs.toLocaleString()} ms`, '');
    }

    if (allModesComplete) {
      // Comparison summary table
      lines.push('### Mode Comparison Summary', '');
      lines.push('| Metric | AI only | Rules + AI | Cloud |');
      lines.push('|--------|---------|------------|-------|');

      const stats = {};
      for (const id of MODE_IDS) stats[id] = computeStats(modeRows[id]);

      lines.push(
        `| Verdict accuracy | ${stats['ai-only'].accuracy}% (${stats['ai-only'].correct}/${stats['ai-only'].total}) | ${stats['rules-ai'].accuracy}% (${stats['rules-ai'].correct}/${stats['rules-ai'].total}) | ${stats['cloud'].accuracy}% (${stats['cloud'].correct}/${stats['cloud'].total}) |`,
        `| False positives  | ${stats['ai-only'].fp} | ${stats['rules-ai'].fp} | ${stats['cloud'].fp} |`,
        `| False negatives  | ${stats['ai-only'].fn} | ${stats['rules-ai'].fn} | ${stats['cloud'].fn} |`,
        `| First run        | ${stats['ai-only'].firstMs?.toLocaleString() ?? '—'} ms | ${stats['rules-ai'].firstMs?.toLocaleString() ?? '—'} ms | ${stats['cloud'].firstMs?.toLocaleString() ?? '—'} ms |`,
        `| Avg (runs 2–${TEST_MESSAGES.length}) | ${stats['ai-only'].avgMs?.toLocaleString() ?? '—'} ms | ${stats['rules-ai'].avgMs?.toLocaleString() ?? '—'} ms | ${stats['cloud'].avgMs?.toLocaleString() ?? '—'} ms |`,
      );
      lines.push('');

      // Per-message comparison table
      lines.push('### Per-message Results', '');
      lines.push('| # | Label | Expected | AI only | Rules + AI | Cloud |');
      lines.push('|---|-------|----------|---------|------------|-------|');

      TEST_MESSAGES.forEach((msg, i) => {
        const exp = Array.isArray(msg.expected) ? msg.expected.join('/') : msg.expected;
        const cells = MODE_IDS.map((id) => {
          const row = modeRows[id]?.[i];
          if (!row) return '—';
          if (row.error) return 'ERR';
          const mark = row.verdictMatch ? '✓' : '✗';
          const fp = row.isFP ? ' FP' : '';
          const fn = row.isFN ? ' FN' : '';
          return `${mark} ${row.actual}${fp}${fn}`;
        });
        lines.push(`| ${msg.id} | ${msg.label} | ${exp} | ${cells.join(' | ')} |`);
      });
    } else {
      // Single mode result
      const availableModes = MODE_IDS.filter((id) => modeRows[id]?.length > 0);
      for (const id of availableModes) {
        const mode = MODES.find((m) => m.id === id);
        const stats = computeStats(modeRows[id]);
        lines.push(`### ${mode.label}`, '');
        lines.push(`**Verdict accuracy:** ${stats.accuracy}% (${stats.correct}/${stats.total})`);
        lines.push(`**False positives:** ${stats.fp}  **False negatives:** ${stats.fn}`);
        if (stats.firstMs != null) lines.push(`**First run:** ${stats.firstMs.toLocaleString()} ms`);
        if (stats.avgMs != null) lines.push(`**Avg (runs 2–${modeRows[id].length}):** ${stats.avgMs.toLocaleString()} ms`);
        lines.push('');
        lines.push('| # | Label | Expected | Actual | Category | Conf | Time |');
        lines.push('|---|-------|----------|--------|----------|------|------|');
        modeRows[id].forEach((r) => {
          const mark = r.verdictMatch ? '✓' : r.error ? 'ERR' : '✗';
          const fp = r.isFP ? ' FP' : '';
          const fn = r.isFN ? ' FN' : '';
          lines.push(`| ${r.id} | ${r.label} | ${r.expected} | ${mark} ${r.actual}${fp}${fn} | ${r.actualCategory} | ${r.confidence} | ${r.durationMs.toLocaleString()} ms |`);
        });
        lines.push('');
      }
    }

    setExportText(lines.join('\n'));
  }

  // ── Status label ─────────────────────────────────────────────────────────────

  function statusLabel() {
    if (runStatus === 'warming') return 'Warming up on-device model…';
    if (runStatus === 'running' && currentMode) {
      const mode = MODES.find((m) => m.id === currentMode);
      return `${mode?.label} — ${currentIndex + 1} / ${TEST_MESSAGES.length}`;
    }
    return '';
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={styles.wrap}>
      {/* Header */}
      <div style={styles.header}>
        <h3 style={styles.title}>Test Suite</h3>
        <div style={styles.controls}>
          <select
            style={styles.select}
            value={selectedMode}
            onChange={(e) => setSelectedMode(e.target.value)}
            disabled={isRunning}
          >
            {MODES.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
          <button
            style={{ ...styles.btn, ...styles.btnSecondary, ...(isRunning ? styles.btnDisabled : {}) }}
            onClick={handleRunSelected}
            disabled={isRunning}
            type="button"
          >
            Run selected
          </button>
          <button
            style={{ ...styles.btn, ...(isRunning ? styles.btnDisabled : {}) }}
            onClick={handleRunAll}
            disabled={isRunning}
            type="button"
          >
            Run all modes
          </button>
        </div>
      </div>

      {/* Progress */}
      {isRunning && (
        <div style={styles.progress}>
          <span style={styles.progressDot} />
          <span>{statusLabel()}</span>
          {MODE_IDS.map((id) => {
            const rows = modeRows[id];
            if (!rows || rows.length === 0) return null;
            const done = rows.length === TEST_MESSAGES.length;
            return (
              <span key={id} style={done ? styles.modePillDone : styles.modePillRunning}>
                {MODES.find((m) => m.id === id)?.short} {rows.length}/{TEST_MESSAGES.length}
              </span>
            );
          })}
        </div>
      )}

      {/* Results */}
      {!isRunning && allModesComplete && (
        <ComparisonView modeRows={modeRows} warmupMs={warmupMs} />
      )}

      {!isRunning && !allModesComplete && MODE_IDS.some((id) => modeRows[id]?.length > 0) && (
        <div>
          {MODE_IDS.filter((id) => modeRows[id]?.length > 0).map((id) => (
            <SingleModeView
              key={id}
              modeId={id}
              rows={modeRows[id]}
              warmupMs={warmupMs}
            />
          ))}
        </div>
      )}

      {/* Warmup timing when done */}
      {!isRunning && warmupMs != null && (
        <div style={styles.warmupRow}>
          <span style={styles.timingPill}>Warm-up: {warmupMs.toLocaleString()} ms</span>
        </div>
      )}

      {/* Export */}
      {!isRunning && Object.keys(modeRows).length > 0 && (
        <div style={styles.exportRow}>
          <button style={{ ...styles.btn, ...styles.btnSecondary }} onClick={handleExport} type="button">
            Export markdown
          </button>
        </div>
      )}

      {exportText && (
        <div style={styles.exportWrap}>
          <div style={styles.exportHint}>
            Paste into docs/eval-results.md (click to select all):
          </div>
          <textarea
            style={styles.exportArea}
            value={exportText}
            readOnly
            onClick={(e) => e.target.select()}
            rows={Math.min(exportText.split('\n').length + 1, 24)}
          />
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ComparisonView({ modeRows, warmupMs }) {
  const stats = {};
  for (const id of MODE_IDS) stats[id] = computeStats(modeRows[id]);

  return (
    <div style={{ marginTop: 12 }}>
      {/* Summary table */}
      <div style={styles.sectionLabel}>Mode comparison</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Metric</th>
              {MODES.map((m) => <th key={m.id} style={styles.th}>{m.short}</th>)}
            </tr>
          </thead>
          <tbody>
            {[
              ['Verdict accuracy', (s) => `${s.accuracy}% (${s.correct}/${s.total})`],
              ['False positives',  (s) => s.fp],
              ['False negatives',  (s) => s.fn],
              ['First run',        (s) => s.firstMs != null ? `${s.firstMs.toLocaleString()} ms` : '—'],
              [`Avg (2–${TEST_MESSAGES.length})`, (s) => s.avgMs != null ? `${s.avgMs.toLocaleString()} ms` : '—'],
            ].map(([label, fn]) => (
              <tr key={label}>
                <td style={{ ...styles.td, fontWeight: 600 }}>{label}</td>
                {MODES.map((m) => (
                  <td key={m.id} style={styles.td}>{stats[m.id] ? fn(stats[m.id]) : '—'}</td>
                ))}
              </tr>
            ))}
            {warmupMs != null && (
              <tr>
                <td style={{ ...styles.td, fontWeight: 600 }}>Warm-up (shared)</td>
                <td style={styles.td}>{warmupMs.toLocaleString()} ms</td>
                <td style={styles.td}>(shared)</td>
                <td style={styles.td}>—</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Per-message comparison */}
      <div style={{ ...styles.sectionLabel, marginTop: 16 }}>Per-message</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>#</th>
              <th style={styles.th}>Label</th>
              <th style={styles.th}>Expected</th>
              {MODES.map((m) => <th key={m.id} style={styles.th}>{m.short}</th>)}
            </tr>
          </thead>
          <tbody>
            {TEST_MESSAGES.map((msg, i) => {
              const exp = Array.isArray(msg.expected) ? msg.expected.join('/') : msg.expected;
              // Row background: fail if any mode missed it
              const anyFail = MODE_IDS.some((id) => modeRows[id]?.[i] && !modeRows[id][i].verdictMatch && !modeRows[id][i].error);
              return (
                <tr key={msg.id} style={anyFail ? styles.rowFail : styles.rowPass}>
                  <td style={styles.td}>{msg.id}</td>
                  <td style={{ ...styles.td, ...styles.tdLabel }}>{msg.label}</td>
                  <td style={styles.td}><VerdictPill v={exp} /></td>
                  {MODES.map((m) => (
                    <td key={m.id} style={styles.td}>
                      <ResultCell row={modeRows[m.id]?.[i]} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SingleModeView({ modeId, rows, warmupMs }) {
  const mode = MODES.find((m) => m.id === modeId);
  const stats = computeStats(rows);
  const done = rows.length === TEST_MESSAGES.length;

  return (
    <div style={{ marginTop: 12 }}>
      <div style={styles.sectionLabel}>{mode.label}</div>
      {done && stats && (
        <div style={styles.statRow}>
          <span style={styles.statBadge}>
            {stats.accuracy}% ({stats.correct}/{stats.total})
          </span>
          <span style={styles.statBadge}>FP: {stats.fp}</span>
          <span style={styles.statBadge}>FN: {stats.fn}</span>
          {stats.firstMs != null && (
            <span style={styles.timingPill}>First: {stats.firstMs.toLocaleString()} ms</span>
          )}
          {stats.avgMs != null && (
            <span style={styles.timingPill}>Avg (2–{rows.length}): {stats.avgMs.toLocaleString()} ms</span>
          )}
          {warmupMs != null && modeId !== 'cloud' && (
            <span style={styles.timingPill}>Warm-up: {warmupMs.toLocaleString()} ms</span>
          )}
        </div>
      )}
      <div style={{ overflowX: 'auto', marginTop: 8 }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>#</th>
              <th style={styles.th}>Label</th>
              <th style={styles.th}>Expected</th>
              <th style={styles.th}>Actual</th>
              <th style={styles.th}>Category</th>
              <th style={styles.th}>Conf</th>
              <th style={styles.th}>Time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                style={row.error ? styles.rowError : row.verdictMatch ? styles.rowPass : styles.rowFail}
              >
                <td style={styles.td}>{row.id}</td>
                <td style={{ ...styles.td, ...styles.tdLabel }}>{row.label}</td>
                <td style={styles.td}><VerdictPill v={row.expected} /></td>
                <td style={styles.td}>
                  <ResultCell row={row} showVerdict />
                </td>
                <td style={styles.td}>
                  {row.error ? '—' : (
                    <span style={{ fontSize: '0.75rem', opacity: 0.75 }}>{row.actualCategory}</span>
                  )}
                </td>
                <td style={styles.td}>{row.confidence}</td>
                <td style={styles.td}>{row.durationMs.toLocaleString()} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ResultCell({ row, showVerdict }) {
  if (!row) return <span style={{ opacity: 0.4 }}>—</span>;
  if (row.error) {
    return <span style={{ color: '#dc2626', fontWeight: 600, cursor: 'help' }} title={row.error}>ERR</span>;
  }
  const color = row.verdictMatch ? '#166534' : row.isFP ? '#dc2626' : row.isFN ? '#d97706' : '#6b7280';
  const mark = row.verdictMatch ? '✓' : '✗';
  return (
    <span style={{ color, fontWeight: 600, fontSize: '0.82rem' }}>
      {mark}
      {showVerdict && ` ${row.actual}`}
      {!showVerdict && ` ${row.actual}`}
      {row.isFP && <span style={{ fontSize: '0.68rem', marginLeft: 2 }}>FP</span>}
      {row.isFN && <span style={{ fontSize: '0.68rem', marginLeft: 2 }}>FN</span>}
    </span>
  );
}

function VerdictPill({ v }) {
  const base = typeof v === 'string' ? v.split('/')[0] : v;
  const colors = {
    scam:       { bg: '#fee2e2', text: '#991b1b' },
    suspicious: { bg: '#fef3c7', text: '#92400e' },
    safe:       { bg: '#dcfce7', text: '#166534' },
  };
  const c = colors[base] ?? { bg: '#f3f4f6', text: '#6b7280' };
  return (
    <span style={{
      display: 'inline-block',
      background: c.bg,
      color: c.text,
      fontSize: '0.72rem',
      fontWeight: 700,
      padding: '2px 7px',
      borderRadius: 99,
    }}>
      {v}
    </span>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

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
  title: {
    margin: 0,
    fontSize: '0.95rem',
    fontWeight: 600,
    color: '#374151',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  select: {
    padding: '6px 10px',
    fontSize: '0.82rem',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    background: '#fff',
    fontFamily: 'inherit',
  },
  btn: {
    padding: '7px 14px',
    fontSize: '0.82rem',
    fontWeight: 600,
    background: '#374151',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },
  btnSecondary: {
    background: '#f3f4f6',
    color: '#374151',
    border: '1px solid #d1d5db',
  },
  btnDisabled: {
    background: '#9ca3af',
    cursor: 'not-allowed',
    border: 'none',
    color: '#fff',
  },
  progress: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 12px',
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: 7,
    fontSize: '0.82rem',
    color: '#1e3a8a',
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  progressDot: {
    display: 'inline-block',
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: '#3b82f6',
    animation: 'pulse 1.2s ease-in-out infinite',
    flexShrink: 0,
  },
  modePillDone: {
    fontSize: '0.72rem',
    background: '#dcfce7',
    color: '#166534',
    padding: '2px 8px',
    borderRadius: 99,
    fontWeight: 600,
  },
  modePillRunning: {
    fontSize: '0.72rem',
    background: '#dbeafe',
    color: '#1e40af',
    padding: '2px 8px',
    borderRadius: 99,
    fontWeight: 600,
  },
  sectionLabel: {
    fontSize: '0.78rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: '#6b7280',
    marginBottom: 6,
  },
  warmupRow: {
    marginTop: 10,
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  statRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  statBadge: {
    fontSize: '0.78rem',
    fontWeight: 600,
    background: '#f3f4f6',
    color: '#374151',
    padding: '3px 10px',
    borderRadius: 99,
  },
  timingPill: {
    fontSize: '0.78rem',
    background: '#e0f2fe',
    color: '#0369a1',
    padding: '3px 10px',
    borderRadius: 99,
    fontWeight: 600,
  },
  exportRow: {
    marginTop: 12,
  },
  exportWrap: {
    marginTop: 10,
  },
  exportHint: {
    fontSize: '0.75rem',
    color: '#6b7280',
    marginBottom: 5,
  },
  exportArea: {
    width: '100%',
    fontFamily: 'monospace',
    fontSize: '0.72rem',
    padding: '10px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    background: '#f9fafb',
    resize: 'vertical',
    boxSizing: 'border-box',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.8rem',
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
    padding: '7px 10px',
    borderBottom: '1px solid #f3f4f6',
    verticalAlign: 'middle',
  },
  tdLabel: {
    maxWidth: 200,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  rowPass: { background: '#f0fdf4' },
  rowFail: { background: '#fef2f2' },
  rowError: { background: '#fffbeb' },
};
