// TestRunner — developer tool for comparing three inference modes against the
// 20 synthetic test messages (18 original + 2 credential_request fix tests).
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

import { useState, useRef } from 'react';
import { onDeviceCheck, cloudCheck, warmUpDeviceModel } from '../ai/checkMessage';
import { aiOnlyCheck } from './aiOnlyCheck';
import { rulesOnlyCheck } from './rulesOnlyCheck';
import { TEST_MESSAGES } from './testMessages';

// ── Constants ──────────────────────────────────────────────────────────────────

const MODES = [
  { id: 'rules-only', label: 'Instant check (any phone, offline)', short: 'Rules only' },
  { id: 'ai-only',    label: 'AI only (on-device)',                 short: 'AI only'    },
  { id: 'rules-ai',   label: 'Rules + AI (on-device)',              short: 'Rules+AI'   },
  { id: 'cloud',      label: 'Cloud',                               short: 'Cloud'      },
  { id: 'hybrid',     label: 'Hybrid (on-device + cloud)',          short: 'Hybrid'     },
];
const MODE_IDS = MODES.map((m) => m.id);

// Delay between cloud requests (ms) — avoids rate limiting
const CLOUD_INTER_REQUEST_DELAY_MS = 4000;
// Max retries on rate-limit or server errors
const MAX_RETRIES = 3;

// ── Helpers ────────────────────────────────────────────────────────────────────

function normalizeVerdict(v) {
  return typeof v === 'string' ? v.trim().toLowerCase() : v;
}

async function checkForMode(modeId, text) {
  if (modeId === 'rules-only') return rulesOnlyCheck(text);
  if (modeId === 'ai-only') return aiOnlyCheck(text);
  if (modeId === 'rules-ai') return onDeviceCheck(text);
  return cloudCheck(text);
}

function isRateLimitError(err) {
  const msg = (err?.message ?? String(err)).toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('too many requests') ||
    msg.includes('overloaded')
  );
}

function buildRow(msg, result, elapsed) {
  // verdict = scoring verdict; displayVerdict = what appears in the table
  // rulesOnlyCheck returns rawVerdict:'unclear' + verdict:'suspicious' for low-signal messages
  const verdict = normalizeVerdict(result.verdict);
  const displayVerdict = normalizeVerdict(result.rawVerdict ?? result.verdict);
  const verdictMatch = Array.isArray(msg.expected)
    ? msg.expected.includes(verdict)
    : verdict === msg.expected;
  const isAmbiguous = Array.isArray(msg.expected) && msg.expected.length > 1;
  const expectedIsSafe = !isAmbiguous && (Array.isArray(msg.expected)
    ? msg.expected.every((e) => e === 'safe')
    : msg.expected === 'safe');
  const isExpectedScam = !isAmbiguous && !expectedIsSafe;
  const isFP = !isAmbiguous && expectedIsSafe && verdict !== 'safe';
  const isFN = !isAmbiguous && !expectedIsSafe && verdict === 'safe';
  const isCaughtScam = isExpectedScam && !isFN && (verdict === 'scam' || verdict === 'suspicious');
  return {
    id: msg.id,
    label: msg.label,
    expected: Array.isArray(msg.expected) ? msg.expected.join('/') : msg.expected,
    actual: displayVerdict,
    actualCategory: result.category,
    confidence: result.confidence,
    verdictMatch,
    isExpectedScam,
    isExpectedSafe: expectedIsSafe,
    isFP,
    isFN,
    isCaughtScam,
    durationMs: result.durationMs ?? elapsed,
    sentToCloud: result.sentToCloud ?? false,
    needsAiReview: result.needsAiReview ?? false,
    error: null,
  };
}

function buildErrorRow(msg, err, elapsed) {
  const isAmbiguous = Array.isArray(msg.expected) && msg.expected.length > 1;
  const expectedIsSafe = !isAmbiguous && (Array.isArray(msg.expected)
    ? msg.expected.every((e) => e === 'safe')
    : msg.expected === 'safe');
  return {
    id: msg.id,
    label: msg.label,
    expected: Array.isArray(msg.expected) ? msg.expected.join('/') : msg.expected,
    actual: '—',
    actualCategory: '—',
    confidence: '—',
    verdictMatch: false,
    isExpectedScam: !isAmbiguous && !expectedIsSafe,
    isExpectedSafe: expectedIsSafe,
    isFP: false,
    isFN: false,
    isCaughtScam: false,
    durationMs: elapsed,
    sentToCloud: false,
    error: err?.message ?? String(err),
  };
}

function computeStats(rows) {
  if (!rows || rows.length === 0) return null;
  const errors = rows.filter((r) => r.error);
  const correct = rows.filter((r) => r.verdictMatch).length;
  const fp = rows.filter((r) => r.isFP).length;
  const fn = rows.filter((r) => r.isFN).length;

  // Scams caught: expected-scam messages that got scam or suspicious
  const scamTotal = rows.filter((r) => r.isExpectedScam).length;
  const scamsCaught = rows.filter((r) => r.isCaughtScam).length;

  // False alarms: expected-safe messages that got non-safe
  const safeTotal = rows.filter((r) => r.isExpectedSafe).length;
  const falseAlarms = rows.filter((r) => r.isFP).length; // isFP = expected safe, got non-safe

  const cloudCount = rows.filter((r) => !r.error && r.sentToCloud).length;

  const firstMs = rows[0]?.durationMs ?? null;
  const rest = rows.slice(1).filter((r) => !r.error);
  const avgMs = rest.length > 0
    ? Math.round(rest.reduce((s, r) => s + r.durationMs, 0) / rest.length)
    : null;

  const needsAiReview = rows.filter((r) => !r.error && r.needsAiReview).length;

  return {
    total: rows.length,
    correct,
    // Accuracy counts errors as failures (denominator = all messages)
    accuracy: Math.round((correct / rows.length) * 100),
    fp, fn,
    errors: errors.length,
    scamTotal, scamsCaught,
    safeTotal, falseAlarms,
    cloudCount,
    needsAiReview,
    firstMs, avgMs,
  };
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function TestRunner() {
  const [runStatus, setRunStatus] = useState('idle'); // 'idle'|'warming'|'running'|'done'
  const [currentMode, setCurrentMode] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [retryMsg, setRetryMsg] = useState('');
  const [warmupMs, setWarmupMs] = useState(null);
  const [modeRows, setModeRows] = useState({}); // { [modeId]: row[] }
  const [selectedMode, setSelectedMode] = useState('rules-ai');
  const [exportText, setExportText] = useState('');

  // Keep a ref to modeRows for use in closures without stale state
  const modeRowsRef = useRef({});

  const isRunning = runStatus === 'warming' || runStatus === 'running';
  const allModesComplete = MODE_IDS.every(
    (id) => modeRows[id] && modeRows[id].length === TEST_MESSAGES.length
  );

  // ── Core run logic ───────────────────────────────────────────────────────────

  async function checkWithRetry(modeId, text, retryCount = 0) {
    try {
      return await checkForMode(modeId, text);
    } catch (err) {
      const isCloud = modeId === 'cloud';
      const isRL = isRateLimitError(err);

      // Cloud: retry on rate limit or server error up to MAX_RETRIES
      if (isCloud && (isRL || err?.message?.includes('5')) && retryCount < MAX_RETRIES) {
        const delayMs = Math.pow(2, retryCount) * 2000; // 2s, 4s, 8s
        setRetryMsg(`Rate limited — retrying in ${delayMs / 1000}s…`);
        await new Promise((r) => setTimeout(r, delayMs));
        setRetryMsg('');
        return checkWithRetry(modeId, text, retryCount + 1);
      }

      // On-device: retry once (already handled inside onDeviceCheck/aiOnlyCheck, but
      // also retry at this level for unexpected errors)
      if (!isCloud && retryCount < 1) {
        setRetryMsg('On-device error — retrying…');
        await new Promise((r) => setTimeout(r, 500));
        setRetryMsg('');
        return checkWithRetry(modeId, text, retryCount + 1);
      }

      throw err;
    }
  }

  async function runModeMessages(modeId) {
    const rows = [];
    for (let i = 0; i < TEST_MESSAGES.length; i++) {
      const msg = TEST_MESSAGES[i];
      setCurrentIndex(i);

      // Inter-request delay for cloud mode (after first request)
      if (modeId === 'cloud' && i > 0) {
        await new Promise((r) => setTimeout(r, CLOUD_INTER_REQUEST_DELAY_MS));
      }

      const start = Date.now();
      try {
        const result = await checkWithRetry(modeId, msg.text);
        rows.push(buildRow(msg, result, Date.now() - start));
      } catch (err) {
        rows.push(buildErrorRow(msg, err, Date.now() - start));
      }

      // Update state reactively so table fills in live
      const snapshot = [...rows];
      modeRowsRef.current = { ...modeRowsRef.current, [modeId]: snapshot };
      setModeRows({ ...modeRowsRef.current });
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
    modeRowsRef.current = { ...modeRowsRef.current };
    delete modeRowsRef.current[selectedMode];
    setModeRows({ ...modeRowsRef.current });

    if (selectedMode !== 'cloud' && selectedMode !== 'rules-only') {
      await doWarmup();
    }

    setRunStatus('running');
    setCurrentMode(selectedMode);
    await runModeMessages(selectedMode);
    setRunStatus('done');
    setCurrentMode(null);
    setCurrentIndex(-1);
    setRetryMsg('');
  }

  async function handleRunAll() {
    setExportText('');
    modeRowsRef.current = {};
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
    setRetryMsg('');
  }

  // ── Export JSON ──────────────────────────────────────────────────────────────

  function buildSnapshot() {
    function chromeVersion() {
      const brands = navigator.userAgentData?.brands;
      if (brands) {
        const chrome = brands.find(
          (b) => b.brand === 'Google Chrome' || b.brand === 'Chromium'
        );
        if (chrome) return chrome.version;
      }
      return navigator.userAgent.match(/Chrome\/(\d+)/)?.[1] ?? 'unknown';
    }
    function getMessageType(msg) {
      if (Array.isArray(msg.expected) && msg.expected.length > 1) return 'ambiguous';
      const exp = Array.isArray(msg.expected) ? msg.expected[0] : msg.expected;
      return exp === 'safe' ? 'safe' : 'scam';
    }
    function rowToResult(row, includeCloud) {
      if (!row) return null;
      if (row.error) return { verdict: null, correct: false, error: row.error.slice(0, 200) };
      const base = { verdict: row.actual, correct: row.verdictMatch };
      if (includeCloud) base.sentToCloud = row.sentToCloud ?? false;
      if (row.needsAiReview) base.needsAiReview = true;
      return base;
    }
    function transformStats(stats) {
      if (!stats) return null;
      const { firstMs, ...rest } = stats;
      return { ...rest, firstRunMs: firstMs };
    }
    return {
      generatedAt: new Date().toISOString(),
      warmupMs: warmupMs ?? null,
      device: {
        chromeVersion: chromeVersion(),
        onDeviceBackend: 'unknown',
        deviceMemory: navigator.deviceMemory ?? null,
        hardwareConcurrency: navigator.hardwareConcurrency ?? null,
      },
      datasetSize: TEST_MESSAGES.length,
      modes: {
        rulesOnly: transformStats(computeStats(modeRows['rules-only'])),
        aiOnly:    transformStats(computeStats(modeRows['ai-only'])),
        rulesAi:   transformStats(computeStats(modeRows['rules-ai'])),
        cloud:     transformStats(computeStats(modeRows['cloud'])),
        hybrid:    transformStats(computeStats(modeRows['hybrid'])),
      },
      messages: TEST_MESSAGES.map((msg, i) => ({
        id: msg.id,
        label: msg.label,
        type: getMessageType(msg),
        preview: msg.text.slice(0, 80) + (msg.text.length > 80 ? '…' : ''),
        expected: Array.isArray(msg.expected) ? msg.expected.join('/') : msg.expected,
        results: {
          rulesOnly: rowToResult(modeRows['rules-only']?.[i]),
          aiOnly:    rowToResult(modeRows['ai-only']?.[i]),
          rulesAi:   rowToResult(modeRows['rules-ai']?.[i]),
          cloud:     rowToResult(modeRows['cloud']?.[i]),
          hybrid:    rowToResult(modeRows['hybrid']?.[i], true),
        },
      })),
    };
  }

  function handleExportJSON() {
    const snap = buildSnapshot();
    const json = JSON.stringify(snap, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scamshield-eval-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Export markdown ───────────────────────────────────────────────────────────

  function handleExport() {
    const lines = ['## ScamShield — Test Suite Results', ''];

    if (warmupMs != null) {
      lines.push(`Warm-up (on-device, shared): ${warmupMs.toLocaleString()} ms`, '');
    }

    if (allModesComplete) {
      lines.push('### Mode Comparison Summary', '');
      const modeShorts = MODES.map((m) => m.short);
      lines.push(`| Metric | ${modeShorts.join(' | ')} |`);
      lines.push(`|--------|${MODES.map(() => '---').join('|')}|`);

      const stats = {};
      for (const id of MODE_IDS) stats[id] = computeStats(modeRows[id]);
      const s = (id) => stats[id];
      const cell = (id, fn) => (s(id) ? fn(id) : '—');

      const n = TEST_MESSAGES.length;
      const metricRows = [
        ['Verdict accuracy', (id) => `${s(id).accuracy}% (${s(id).correct}/${s(id).total})`],
        ['Scams caught',     (id) => `${s(id).scamsCaught}/${s(id).scamTotal}`],
        ['False alarms',     (id) => `${s(id).falseAlarms}/${s(id).safeTotal}`],
        ['False positives',  (id) => s(id).fp],
        ['False negatives',  (id) => s(id).fn],
        ['Errors',           (id) => s(id).errors],
        ['Needs AI review',  (id) => s(id).needsAiReview > 0 ? `${s(id).needsAiReview}/${n}` : `0/${n}`],
        ['Sent to cloud',    (id) => {
          if (id === 'cloud') return `${n}/${n}`;
          if (id === 'hybrid') return s(id).cloudCount != null ? `${s(id).cloudCount}/${n}` : '—';
          return `0/${n}`;
        }],
        ['First run',        (id) => s(id).firstMs != null ? `${s(id).firstMs.toLocaleString()} ms` : '—'],
        [`Avg (2–${n})`,     (id) => s(id).avgMs != null ? `${s(id).avgMs.toLocaleString()} ms` : '—'],
      ];
      metricRows.forEach(([label, fn]) => {
        lines.push(`| ${label} | ${MODE_IDS.map((id) => cell(id, fn)).join(' | ')} |`);
      });
      lines.push('');

      lines.push('### Per-message Results', '');
      lines.push(`| # | Label | Expected | ${modeShorts.join(' | ')} |`);
      lines.push(`|---|-------|----------|${MODES.map(() => '---').join('|')}|`);

      TEST_MESSAGES.forEach((msg, i) => {
        const exp = Array.isArray(msg.expected) ? msg.expected.join('/') : msg.expected;
        const cells = MODE_IDS.map((id) => {
          const row = modeRows[id]?.[i];
          if (!row) return '—';
          if (row.error) return 'ERR';
          const mark = row.verdictMatch ? '✓' : '✗';
          const cloud = (id === 'hybrid' && row.sentToCloud) ? ' ☁️' : '';
          const fp = row.isFP ? ' FP' : '';
          const fn = row.isFN ? ' FN' : '';
          const ai = row.needsAiReview ? ' ?' : '';
          return `${mark} ${row.actual}${cloud}${fp}${fn}${ai}`;
        });
        lines.push(`| ${msg.id} | ${msg.label} | ${exp} | ${cells.join(' | ')} |`);
      });
      lines.push('');

      // Error details section
      const allErrors = [];
      for (const id of MODE_IDS) {
        const mode = MODES.find((m) => m.id === id);
        modeRows[id]?.forEach((row) => {
          if (row.error) allErrors.push({ mode: mode.short, id: row.id, label: row.label, error: row.error });
        });
      }
      if (allErrors.length > 0) {
        lines.push('### Error Details', '');
        lines.push('| # | Mode | Label | Error |');
        lines.push('|---|------|-------|-------|');
        allErrors.forEach(({ mode, id, label, error }) => {
          lines.push(`| ${id} | ${mode} | ${label} | ${error.slice(0, 120)} |`);
        });
        lines.push('');
      }
    } else {
      const availableModes = MODE_IDS.filter((id) => modeRows[id]?.length > 0);
      for (const id of availableModes) {
        const mode = MODES.find((m) => m.id === id);
        const stats = computeStats(modeRows[id]);
        lines.push(`### ${mode.label}`, '');
        lines.push(`**Verdict accuracy:** ${stats.accuracy}% (${stats.correct}/${stats.total})`);
        lines.push(`**Scams caught:** ${stats.scamsCaught}/${stats.scamTotal}  **False alarms:** ${stats.falseAlarms}/${stats.safeTotal}`);
        lines.push(`**FP:** ${stats.fp}  **FN:** ${stats.fn}  **Errors:** ${stats.errors}`);
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

        const errors = modeRows[id].filter((r) => r.error);
        if (errors.length > 0) {
          lines.push('**Errors:**', '');
          errors.forEach((r) => lines.push(`- #${r.id} ${r.label}: ${r.error}`));
          lines.push('');
        }
      }
    }

    setExportText(lines.join('\n'));
  }

  // ── Status label ─────────────────────────────────────────────────────────────

  function statusLabel() {
    if (retryMsg) return retryMsg;
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
        <div style={retryMsg ? { ...styles.progress, ...styles.progressRetry } : styles.progress}>
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
        <div style={{ ...styles.exportRow, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={{ ...styles.btn, ...styles.btnSecondary }} onClick={handleExport} type="button">
            Export markdown
          </button>
          <button style={{ ...styles.btn, ...styles.btnSecondary }} onClick={handleExportJSON} type="button">
            Export JSON
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
  const s = (id) => stats[id];

  const n = TEST_MESSAGES.length;
  const anyNeedsAiReview = Object.values(stats).some((st) => st && st.needsAiReview > 0);
  const metricRows = [
    ['Verdict accuracy', (id) => `${s(id).accuracy}% (${s(id).correct}/${s(id).total})`],
    ['Scams caught',     (id) => `${s(id).scamsCaught}/${s(id).scamTotal}`],
    ['False alarms',     (id) => `${s(id).falseAlarms}/${s(id).safeTotal}`],
    ['False positives',  (id) => s(id).fp],
    ['False negatives',  (id) => s(id).fn],
    ['Errors',           (id) => s(id).errors],
    ...(anyNeedsAiReview ? [['Needs AI review', (id) => s(id).needsAiReview > 0 ? `${s(id).needsAiReview}/${n}` : `0/${n}`]] : []),
    ['Sent to cloud',    (id) => {
      if (id === 'cloud') return `${n}/${n}`;
      if (id === 'hybrid') return s(id).cloudCount != null ? `${s(id).cloudCount}/${n}` : '—';
      return `0/${n}`;
    }],
    ['First run',        (id) => s(id).firstMs != null ? `${s(id).firstMs.toLocaleString()} ms` : '—'],
    [`Avg (2–${n})`, (id) => s(id).avgMs != null ? `${s(id).avgMs.toLocaleString()} ms` : '—'],
  ];

  return (
    <div style={{ marginTop: 12 }}>
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
            {metricRows.map(([label, fn]) => (
              <tr key={label}>
                <td style={{ ...styles.td, fontWeight: 600 }}>{label}</td>
                {MODES.map((m) => (
                  <td key={m.id} style={styles.td}>{stats[m.id] ? fn(m.id) : '—'}</td>
                ))}
              </tr>
            ))}
            {warmupMs != null && (
              <tr>
                <td style={{ ...styles.td, fontWeight: 600 }}>Warm-up (shared)</td>
                <td style={styles.td}>{warmupMs.toLocaleString()} ms</td>
                <td style={styles.td}>(shared)</td>
                <td style={styles.td}>—</td>
                <td style={styles.td}>(shared)</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
              const anyFail = MODE_IDS.some(
                (id) => modeRows[id]?.[i] && !modeRows[id][i].verdictMatch && !modeRows[id][i].error
              );
              return (
                <tr key={msg.id} style={anyFail ? styles.rowFail : styles.rowPass}>
                  <td style={styles.td}>{msg.id}</td>
                  <td style={{ ...styles.td, ...styles.tdLabel }}>{msg.label}</td>
                  <td style={styles.td}><VerdictPill v={exp} /></td>
                  {MODES.map((m) => (
                    <td key={m.id} style={styles.td}>
                      <ResultCell row={modeRows[m.id]?.[i]} showCloud={m.id === 'hybrid'} />
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
          <span style={styles.statBadge}>{stats.accuracy}% ({stats.correct}/{stats.total})</span>
          <span style={styles.statBadge}>Scams: {stats.scamsCaught}/{stats.scamTotal}</span>
          <span style={styles.statBadge}>Alarms: {stats.falseAlarms}/{stats.safeTotal}</span>
          <span style={styles.statBadge}>FP: {stats.fp}</span>
          <span style={styles.statBadge}>FN: {stats.fn}</span>
          {stats.errors > 0 && <span style={{ ...styles.statBadge, ...styles.badgeError }}>Errors: {stats.errors}</span>}
          {stats.needsAiReview > 0 && <span style={{ ...styles.statBadge, ...styles.badgeAi }}>Needs AI review: {stats.needsAiReview}/{rows.length}</span>}
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
                <td style={styles.td}><ResultCell row={row} /></td>
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

function ResultCell({ row, showCloud }) {
  if (!row) return <span style={{ opacity: 0.4 }}>—</span>;
  if (row.error) {
    return (
      <span
        style={{ color: '#dc2626', fontWeight: 600, cursor: 'help', textDecoration: 'underline dotted' }}
        title={row.error}
      >
        ERR
      </span>
    );
  }
  const color = row.verdictMatch ? '#166534' : row.isFP ? '#dc2626' : row.isFN ? '#d97706' : '#6b7280';
  const mark = row.verdictMatch ? '✓' : '✗';
  return (
    <span style={{ color, fontWeight: 600, fontSize: '0.82rem' }}>
      {mark} {row.actual}
      {showCloud && row.sentToCloud && <span style={{ fontSize: '0.78rem', marginLeft: 2 }}>☁️</span>}
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
    unclear:    { bg: '#f0f9ff', text: '#0369a1' },
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
  progressRetry: {
    background: '#fffbeb',
    border: '1px solid #fcd34d',
    color: '#92400e',
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
  badgeError: {
    background: '#fef2f2',
    color: '#991b1b',
  },
  badgeAi: {
    background: '#f0f9ff',
    color: '#0369a1',
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
  rowPass:  { background: '#f0fdf4' },
  rowFail:  { background: '#fef2f2' },
  rowError: { background: '#fffbeb' },
};
