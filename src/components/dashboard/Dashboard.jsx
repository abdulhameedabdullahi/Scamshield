// Evaluation Dashboard — shows accuracy stats from the saved snapshot or a live run.
// No new libraries: charts are plain SVG, layout is CSS.
//
// Data flow:
//   1. Loads src/data/evalSnapshot.json (placeholder until a real run is exported)
//   2. User can run the suite live; results display in the same components, labelled
//      "Live — your device" and NOT written back to the JSON file.

import { useState, useEffect } from 'react';
import snapshot from '../../data/evalSnapshot.json';
import { getOnDeviceAvailability } from '../../ai/availability';
import { onDeviceCheck, cloudCheck, hybridCheck, warmUpDeviceModel } from '../../ai/checkMessage';
import { aiOnlyCheck } from '../../dev/aiOnlyCheck';
import { TEST_MESSAGES } from '../../dev/testMessages';
import ComparisonChart from './ComparisonChart';
import MessageTable from './MessageTable';

// ── Helpers ────────────────────────────────────────────────────────────────────

function safePct(num, den) {
  if (num == null || !den || den === 0) return 0;
  return Math.round((num / den) * 100);
}

function fmtMs(ms) {
  if (ms == null) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  } catch { return iso; }
}

function getMessageType(msg) {
  if (Array.isArray(msg.expected) && msg.expected.length > 1) return 'ambiguous';
  const exp = Array.isArray(msg.expected) ? msg.expected[0] : msg.expected;
  return exp === 'safe' ? 'safe' : 'scam';
}

function buildLiveSnapshot(liveRows, includeCloud) {
  function computeLiveModeStats(rows) {
    if (!rows) return null;
    let correct = 0, errors = 0, scamsCaught = 0, falseAlarms = 0, cloudCount = 0;
    let scamTotal = 0, safeTotal = 0;
    const durations = [];

    TEST_MESSAGES.forEach((msg, i) => {
      const row = rows[i];
      const isAmbig = Array.isArray(msg.expected) && msg.expected.length > 1;
      const isSafe  = !isAmbig && (Array.isArray(msg.expected)
        ? msg.expected.every((e) => e === 'safe')
        : msg.expected === 'safe');
      const isScam = !isAmbig && !isSafe;

      if (isSafe) safeTotal++;
      if (isScam) scamTotal++;
      if (!row) return;
      if (row.error) { errors++; return; }

      const v = row.verdict;
      const match = Array.isArray(msg.expected) ? msg.expected.includes(v) : v === msg.expected;
      if (match) correct++;
      if (isSafe && v !== 'safe') falseAlarms++;
      if (isScam && (v === 'scam' || v === 'suspicious')) scamsCaught++;
      if (row.sentToCloud) cloudCount++;
      if (row.durationMs) durations.push(row.durationMs);
    });

    return {
      accuracy: Math.round((correct / TEST_MESSAGES.length) * 100),
      correct,
      total: TEST_MESSAGES.length,
      scamsCaught, scamTotal,
      falseAlarms, safeTotal,
      errors,
      cloudCount,
      firstRunMs: durations[0] ?? null,
      avgMs: durations.length > 1
        ? Math.round(durations.slice(1).reduce((a, b) => a + b, 0) / (durations.length - 1))
        : null,
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    isLive: true,
    device: {
      chromeVersion: (navigator.userAgentData?.brands?.find(
        (b) => b.brand === 'Google Chrome' || b.brand === 'Chromium',
      )?.version ?? navigator.userAgent.match(/Chrome\/(\d+)/)?.[1]) ?? 'unknown',
      deviceMemory: navigator.deviceMemory ?? null,
      hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    },
    datasetSize: TEST_MESSAGES.length,
    modes: {
      aiOnly:  computeLiveModeStats(liveRows.aiOnly),
      rulesAi: computeLiveModeStats(liveRows.rulesAi),
      hybrid:  computeLiveModeStats(liveRows.hybrid),
      cloud:   includeCloud ? computeLiveModeStats(liveRows.cloud) : null,
    },
    messages: TEST_MESSAGES.map((msg, i) => {
      function pick(rows, storeCloud) {
        if (!rows) return null;
        const r = rows[i];
        if (!r) return null;
        if (r.error) return { verdict: null, correct: false, error: r.error };
        const match = Array.isArray(msg.expected)
          ? msg.expected.includes(r.verdict) : r.verdict === msg.expected;
        const base = { verdict: r.verdict, correct: match };
        if (storeCloud) base.sentToCloud = r.sentToCloud ?? false;
        return base;
      }
      return {
        id: msg.id,
        label: msg.label,
        type: getMessageType(msg),
        preview: msg.text.slice(0, 80) + (msg.text.length > 80 ? '…' : ''),
        expected: Array.isArray(msg.expected) ? msg.expected.join('/') : msg.expected,
        results: {
          aiOnly:  pick(liveRows.aiOnly),
          rulesAi: pick(liveRows.rulesAi),
          hybrid:  pick(liveRows.hybrid, true),
          cloud:   includeCloud ? pick(liveRows.cloud) : null,
        },
      };
    }),
  };
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [liveData, setLiveData]           = useState(null);
  const [liveRunState, setLiveRunState]   = useState('idle'); // idle|warming|running|done|error
  const [liveProgress, setLiveProgress]   = useState(null);  // { mode, index }
  const [liveError, setLiveError]         = useState('');
  const [includeCloud, setIncludeCloud]   = useState(false);
  const [onDeviceAvail, setOnDeviceAvail] = useState(null);

  useEffect(() => {
    getOnDeviceAvailability().then(setOnDeviceAvail);
  }, []);

  const data = liveData ?? (snapshot.placeholder ? null : snapshot);
  const ru   = data?.modes?.rulesAi;
  const hy   = data?.modes?.hybrid;

  // ── Live run ──────────────────────────────────────────────────────────────

  async function handleRunLive() {
    setLiveData(null);
    setLiveError('');

    // Warm up on-device model
    setLiveRunState('warming');
    setLiveProgress({ mode: 'warm-up', index: 0 });
    try { await warmUpDeviceModel(); } catch { /* non-fatal */ }

    setLiveRunState('running');
    const liveRows = { aiOnly: [], rulesAi: [], hybrid: [], cloud: [] };

    const tasks = [
      { key: 'aiOnly',  fn: (t) => aiOnlyCheck(t) },
      { key: 'rulesAi', fn: (t) => onDeviceCheck(t) },
      { key: 'hybrid',  fn: (t) => hybridCheck(t) },
      ...(includeCloud ? [{ key: 'cloud', fn: (t) => cloudCheck(t) }] : []),
    ];

    try {
      for (const task of tasks) {
        for (let i = 0; i < TEST_MESSAGES.length; i++) {
          setLiveProgress({ mode: task.key, index: i });
          if (task.key === 'cloud' && i > 0) {
            await new Promise((r) => setTimeout(r, 4000));
          }
          const start = Date.now();
          try {
            const result = await task.fn(TEST_MESSAGES[i].text);
            liveRows[task.key].push({
              verdict: result.verdict,
              durationMs: Date.now() - start,
              sentToCloud: result.sentToCloud ?? false,
            });
          } catch (err) {
            liveRows[task.key].push({ error: (err?.message ?? String(err)).slice(0, 200) });
          }
        }
      }
      setLiveData(buildLiveSnapshot(liveRows, includeCloud));
      setLiveRunState('done');
    } catch (err) {
      setLiveError(err?.message ?? 'Unexpected error during live run.');
      setLiveRunState('error');
    }
    setLiveProgress(null);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={S.page}>

      {/* ── Header ── */}
      <header style={S.header}>
        <h1 style={S.h1}>How accurate is ScamShield?</h1>
        <p style={S.lead}>
          In our tests, ScamShield caught every scam message while checking on the phone —
          with zero messages uploaded to any server.
        </p>
        <p style={{ ...S.lead, fontSize: '0.875rem', marginTop: 10 }}>
          We tested the same {data?.datasetSize ?? 20} messages four ways: on-device AI alone,
          our Rules&nbsp;+&nbsp;AI design (the default), cloud-only, and a hybrid mode.
        </p>
      </header>

      {/* ── Live results banner ── */}
      {liveData && (
        <div style={S.liveBanner}>
          <span>⚡ Live results from your device — not saved</span>
          <button style={S.liveDismiss} type="button" onClick={() => setLiveData(null)}>
            Back to saved results
          </button>
        </div>
      )}

      {/* ── No data placeholder ── */}
      {!data ? (
        <div style={S.placeholder}>
          <p style={{ margin: '0 0 8px', fontWeight: 600 }}>No results yet</p>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280' }}>
            Run the suite in <strong>Developer tools → Test Suite → Run all modes → Export JSON</strong>,
            then paste the file into <code>src/data/evalSnapshot.json</code>. Or run it live below.
          </p>
        </div>
      ) : (
        <>
          {/* ── Stat tiles — Rules + AI ── */}
          <section aria-label="Key metrics for Rules + AI mode">
            <SectionLabel>Rules + AI — key metrics</SectionLabel>
            <div style={S.tileGrid}>
              <StatTile
                label="Verdict accuracy"
                value={`${ru?.accuracy ?? '—'}%`}
                sub={ru ? `${ru.correct} correct out of ${ru.total}` : ''}
                accent="#2563eb"
              />
              <StatTile
                label="Scams caught"
                value={ru ? `${ru.scamsCaught}/${ru.scamTotal}` : '—'}
                sub={ru ? `${safePct(ru.scamsCaught, ru.scamTotal)}% detection rate` : ''}
                accent="#dc2626"
              />
              <StatTile
                label="False alarms"
                value={ru ? `${ru.falseAlarms}/${ru.safeTotal}` : '—'}
                sub={`${ru ? safePct(ru.falseAlarms, ru.safeTotal) : '—'}% of safe messages flagged`}
                accent="#d97706"
              />
              <StatTile
                label="Cloud uploads"
                value="0"
                sub="On-device mode — private by design"
                accent="#059669"
              />
            </div>
          </section>

          {/* ── Stat tiles — Hybrid ── */}
          {hy && (
            <section aria-label="Key metrics for Hybrid mode">
              <SectionLabel>Hybrid mode — key metrics</SectionLabel>
              <div style={S.tileGrid}>
                <StatTile
                  label="Hybrid accuracy"
                  value={`${hy.accuracy}%`}
                  sub={`${hy.correct} correct out of ${hy.total}`}
                  accent="#7c3aed"
                />
                <StatTile
                  label="Kept fully private"
                  value={`${hy.total - (hy.cloudCount ?? 0)}/${hy.total}`}
                  sub={`${hy.cloudCount ?? 0} messages escalated to cloud`}
                  accent="#059669"
                />
              </div>
            </section>
          )}

          {/* ── Comparison chart ── */}
          <Section title="Mode comparison" id="comparison">
            <ComparisonChart modes={data.modes} />
          </Section>

          {/* ── Speed ── */}
          <Section title="Speed" id="speed">
            <SpeedTable modes={data.modes} warmupMs={data.warmupMs} />
            <p style={S.note}>
              On-device speed depends on your hardware (GPU vs CPU-only). Rules give an instant
              preview of warning signs while the AI reviews — so users see feedback in milliseconds
              even if the full check takes 20&nbsp;s.
            </p>
          </Section>

          {/* ── Per-message results ── */}
          <Section title="Message-by-message results" id="messages">
            <MessageTable messages={data.messages} />
          </Section>
        </>
      )}

      {/* ── How we tested ── */}
      <Section title="How we tested" id="how-we-tested" dimmed>
        <HowWeTested data={data} />
      </Section>

      {/* ── What the modes mean ── */}
      <Section title="What the modes mean" id="modes-explained" dimmed>
        <ul style={S.modeList}>
          <li>
            <strong>AI only</strong> — Gemini Nano receives the raw message with a minimal
            prompt and no additional context. This shows what the base model can do without
            any engineering.
          </li>
          <li>
            <strong>Rules + AI ★ (our design)</strong> — a pure-JS rule engine runs first
            and finds evidence (links, credential requests, urgency cues). The rule engine&apos;s
            findings are injected into the prompt so Nano focuses on reasoning, not
            pattern-matching. Post-processing enforces verdict consistency and drops
            any AI-generated phrases not found in the original message. Nothing is sent to the
            cloud.
          </li>
          <li>
            <strong>Cloud</strong> — personal details are masked on-device first (regex masker),
            then the masked text is sent to Gemini&nbsp;3.5&nbsp;Flash-Lite. Only called with
            explicit user consent.
          </li>
          <li>
            <strong>Hybrid</strong> — Rules + AI runs on-device first. If the verdict is
            &ldquo;safe&rdquo;, the message stays fully private. If it is &ldquo;scam&rdquo;
            or &ldquo;suspicious&rdquo;, the masked text is sent to the cloud for a second
            opinion and the cloud verdict is used as final. A veto prevents the cloud from
            overriding a strong on-device rule signal (credential request, AI injection,
            or link&nbsp;+&nbsp;threat).
          </li>
        </ul>
      </Section>

      {/* ── Run on your device ── */}
      <Section title="Run on your device" id="live-run" dimmed>
        <RunOnDevice
          availability={onDeviceAvail}
          includeCloud={includeCloud}
          onIncludeCloudChange={setIncludeCloud}
          onRun={handleRunLive}
          runState={liveRunState}
          progress={liveProgress}
          error={liveError}
        />
      </Section>

    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatTile({ label, value, sub, accent }) {
  return (
    <div style={{ ...S.tile, borderTopColor: accent }}>
      <div style={S.tileValue}>{value}</div>
      <div style={S.tileLabel}>{label}</div>
      {sub && <div style={S.tileSub}>{sub}</div>}
    </div>
  );
}

function SectionLabel({ children }) {
  return <p style={S.sectionLabel}>{children}</p>;
}

function Section({ title, id, children, dimmed }) {
  return (
    <section aria-labelledby={id} style={dimmed ? S.sectionDimmed : S.section}>
      <h2 id={id} style={S.h2}>{title}</h2>
      {children}
    </section>
  );
}

function SpeedTable({ modes, warmupMs }) {
  const rows = [
    { label: 'AI only',       key: 'aiOnly',  note: 'On-device'                   },
    { label: 'Rules + AI ★',  key: 'rulesAi', note: 'On-device'                   },
    { label: 'Cloud',         key: 'cloud',   note: 'Cloud (masked)'              },
    { label: 'Hybrid',        key: 'hybrid',  note: 'On-device + cloud (some)'    },
  ];
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: '0.85rem', width: '100%' }}>
        <thead>
          <tr>
            {['Mode', 'First check', 'Avg check', 'Note'].map((h) => (
              <th key={h} style={ST.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ label, key, note }) => {
            const m = modes?.[key];
            const isHighlight = key === 'rulesAi';
            return (
              <tr key={key} style={{ background: isHighlight ? '#eff6ff' : undefined }}>
                <td style={{ ...ST.td, fontWeight: isHighlight ? 700 : 400, color: isHighlight ? '#1d4ed8' : undefined }}>
                  {label}
                </td>
                <td style={ST.td}>{fmtMs(m?.firstRunMs)}</td>
                <td style={ST.td}>{fmtMs(m?.avgMs)}</td>
                <td style={{ ...ST.td, color: '#6b7280' }}>{note}</td>
              </tr>
            );
          })}
          {warmupMs != null && (
            <tr>
              <td style={{ ...ST.td, color: '#6b7280' }} colSpan={2}>
                On-device warm-up (shared)
              </td>
              <td style={ST.td}>{fmtMs(warmupMs)}</td>
              <td style={{ ...ST.td, color: '#6b7280' }}>One-time per page load</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function HowWeTested({ data }) {
  const msgs   = data?.messages ?? [];
  const nScam  = msgs.filter((m) => m.type === 'scam').length;
  const nSafe  = msgs.filter((m) => m.type === 'safe').length;
  const nAmbig = msgs.filter((m) => m.type === 'ambiguous').length;
  const total  = data?.datasetSize ?? TEST_MESSAGES.length;
  const date   = fmtDate(data?.generatedAt);
  const device = data?.device;

  return (
    <div style={{ fontSize: '0.875rem', lineHeight: 1.65 }}>
      <p>
        We assembled a synthetic dataset of <strong>{total} messages</strong>:{' '}
        {nScam} scam messages covering 9 Nigerian scam categories (fake bank alerts,
        BVN/NIN threats, OTP phishing, job-offer upfront fees, lottery scams, impersonation,
        investment schemes, wrong-transfer refund, phishing links), {nSafe} legitimate messages
        (genuine bank alerts, personal messages, delivery updates, OTP notifications with
        do-not-share warnings), and {nAmbig} ambiguous message{nAmbig !== 1 ? 's' : ''}.
        Edge cases include a Pidgin-language scam, a prompt-injection attack, and
        defensive OTP messages that explicitly warn not to share the code.
      </p>
      <p>
        <strong>All messages are synthetic</strong> — fake names, phone numbers,
        account numbers and links — so no real personal data was used in testing.
      </p>
      {date !== '—' && (
        <p>
          Test date: <strong>{date}</strong>.{' '}
          {device?.chromeVersion && device.chromeVersion !== 'unknown' && (
            <>Chrome {device.chromeVersion}. </>
          )}
          {device?.deviceMemory && (<>{device.deviceMemory}&nbsp;GB RAM, </>)}
          {device?.hardwareConcurrency && (<>{device.hardwareConcurrency}&nbsp;CPU cores.</>)}
        </p>
      )}
      <p style={{ color: '#6b7280' }}>
        <strong>Limitations:</strong> this is a small synthetic dataset; real-world accuracy
        may differ. We add new messages as we identify gaps to avoid over-fitting. On-device
        accuracy depends on the Chrome version — Gemini Nano weights update automatically.
        Results labelled &ldquo;live&rdquo; reflect your specific device and model version.
      </p>
    </div>
  );
}

const AVAIL_LABEL = {
  available:    null,
  downloadable: 'Gemini Nano is not downloaded on this device. Use Developer tools → Test Suite to download it first.',
  downloading:  'Gemini Nano is downloading. Try again once the download completes.',
  unavailable:  'Gemini Nano is not supported in this browser. Only the Cloud mode can run.',
  unsupported:  'Gemini Nano is not supported in this browser. Only the Cloud mode can run.',
};

const MODE_LABEL = {
  'warm-up': 'Warming up on-device model',
  aiOnly:    'AI only (on-device)',
  rulesAi:   'Rules + AI (on-device)',
  hybrid:    'Hybrid (on-device + cloud)',
  cloud:     'Cloud',
};

function RunOnDevice({ availability, includeCloud, onIncludeCloudChange, onRun, runState, progress, error }) {
  const isRunning     = runState === 'warming' || runState === 'running';
  const canRunDevice  = availability === 'available';
  const deviceBlocked = !canRunDevice && availability != null && availability !== 'available';
  const deviceMsg     = AVAIL_LABEL[availability] ?? null;

  const total = TEST_MESSAGES.length;
  const modeLabel = progress ? (MODE_LABEL[progress.mode] ?? progress.mode) : '';
  const idx = progress?.index ?? 0;

  return (
    <div>
      <p style={{ fontSize: '0.875rem', marginTop: 0, lineHeight: 1.65 }}>
        Run the full test suite right now against the on-device Gemini Nano model on
        your machine. Results are shown in the charts and table above, labelled
        &ldquo;Live&rdquo; — they are <em>not</em> saved to disk.
      </p>

      {deviceBlocked && deviceMsg && (
        <p style={{ ...S.note, background: '#fef3c7', border: '1px solid #fcd34d', padding: '10px 14px', borderRadius: 7 }}>
          {deviceMsg}
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={includeCloud}
            onChange={(e) => onIncludeCloudChange(e.target.checked)}
            disabled={isRunning}
          />
          Include cloud (uses masked text)
        </label>
      </div>

      <button
        type="button"
        onClick={onRun}
        disabled={isRunning || (!canRunDevice && !includeCloud)}
        aria-busy={isRunning}
        style={{
          padding: '9px 20px',
          fontSize: '0.875rem',
          fontWeight: 700,
          background: isRunning || (!canRunDevice && !includeCloud) ? '#9ca3af' : '#1d4ed8',
          color: '#fff',
          border: 'none',
          borderRadius: 7,
          cursor: isRunning || (!canRunDevice && !includeCloud) ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {isRunning ? 'Running…' : 'Run test suite on this device'}
      </button>

      {isRunning && progress && (
        <div style={S.liveProgress}>
          <span style={S.liveProgressDot} />
          {modeLabel} — message {idx + 1}/{total}
        </div>
      )}

      {runState === 'done' && !isRunning && (
        <p style={{ marginTop: 10, fontSize: '0.82rem', color: '#059669', fontWeight: 600 }}>
          ✓ Done — scroll up to see live results.
        </p>
      )}

      {runState === 'error' && error && (
        <p style={{ marginTop: 10, fontSize: '0.82rem', color: '#dc2626' }}>
          Error: {error}
        </p>
      )}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const S = {
  page: {
    maxWidth: 720,
    margin: '0 auto',
    padding: '0 20px 60px',
    fontFamily: 'var(--font-body)',
  },
  header: {
    paddingTop: 32,
    marginBottom: 28,
    borderBottom: '2px solid var(--plum-100)',
    paddingBottom: 24,
  },
  h1: {
    fontFamily: 'var(--font-heading)',
    fontSize: '1.75rem',
    fontWeight: 600,
    margin: '0 0 12px',
    color: 'var(--plum-900)',
  },
  h2: {
    fontFamily: 'var(--font-heading)',
    fontSize: '1.0625rem',
    fontWeight: 600,
    margin: '0 0 14px',
    color: 'var(--plum-900)',
  },
  lead: {
    fontSize: '1.0625rem',
    color: 'var(--ink)',
    lineHeight: 1.6,
    margin: 0,
  },
  liveBanner: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    background: 'var(--plum-100)',
    border: '1px solid var(--line)',
    borderRadius: 10,
    padding: '10px 14px',
    marginBottom: 20,
    fontSize: '0.9375rem',
    color: 'var(--plum-900)',
    fontWeight: 600,
    flexWrap: 'wrap',
  },
  liveDismiss: {
    background: 'none',
    border: 'none',
    color: 'var(--plum-700)',
    cursor: 'pointer',
    textDecoration: 'underline',
    fontFamily: 'inherit',
    fontSize: '0.875rem',
    padding: 0,
  },
  placeholder: {
    background: 'var(--plum-100)',
    border: '1px dashed var(--line)',
    borderRadius: 10,
    padding: '20px 24px',
    marginBottom: 24,
  },
  tileGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: 14,
    marginBottom: 32,
  },
  tile: {
    background: 'var(--paper)',
    border: '1px solid var(--line)',
    borderTop: '3px solid var(--plum-700)',
    borderRadius: 10,
    padding: '14px 16px',
  },
  tileValue: {
    fontSize: '1.75rem',
    fontFamily: 'var(--font-heading)',
    fontWeight: 600,
    lineHeight: 1,
    marginBottom: 4,
    color: 'var(--plum-900)',
  },
  tileLabel: {
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: 'var(--ink)',
    marginBottom: 3,
  },
  tileSub: {
    fontSize: '0.75rem',
    color: '#888',
  },
  section: {
    marginBottom: 40,
  },
  sectionDimmed: {
    marginBottom: 40,
    paddingTop: 24,
    borderTop: '1px solid var(--line)',
  },
  sectionLabel: {
    fontSize: '0.75rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    color: '#888',
    margin: '0 0 10px',
  },
  note: {
    fontSize: '0.875rem',
    color: '#666',
    marginTop: 10,
    lineHeight: 1.55,
  },
  modeList: {
    margin: 0,
    paddingLeft: 20,
    lineHeight: 1.7,
    fontSize: '0.9375rem',
    color: 'var(--ink)',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  liveProgress: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    fontSize: '0.875rem',
    color: 'var(--plum-700)',
    background: 'var(--plum-100)',
    border: '1px solid var(--line)',
    borderRadius: 8,
    padding: '8px 12px',
  },
  liveProgressDot: {
    display: 'inline-block',
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: 'var(--plum-700)',
    animation: 'pulse 1.2s ease-in-out infinite',
    flexShrink: 0,
  },
};

const ST = {
  th: {
    padding: '7px 12px',
    textAlign: 'left',
    fontWeight: 600,
    color: '#6b7280',
    fontSize: '0.82rem',
    borderBottom: '1px solid #e5e7eb',
    background: '#f9fafb',
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '7px 12px',
    fontSize: '0.85rem',
    borderBottom: '1px solid #f3f4f6',
  },
};
