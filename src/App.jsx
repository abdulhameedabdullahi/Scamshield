import { useState, useEffect, useCallback } from 'react';
import { APP_NAME } from './config';
import { getOnDeviceAvailability } from './ai/availability';
import {
  checkMessage, downloadAndCheck, cloudCheck,
  preloadDeviceModel, warmUpDeviceModel,
} from './ai/checkMessage';
import { analyzeSignals } from './ai/rules';
import { detectEntities } from './ai/maskMessage';
import ModelStatus from './components/ModelStatus';
import MessageInput from './components/MessageInput';
import VerdictCard from './components/VerdictCard';
import SendPreview from './components/SendPreview';
import AgentPanel from './components/AgentPanel';
import DevTestPanel from './components/DevTestPanel';
import TestRunner from './dev/TestRunner';
import { runAgentTests, runAgentDemo } from './dev/agentTest';
import Dashboard from './components/dashboard/Dashboard';

// App-level state machine:
//   idle           → waiting for user to type and click Check
//   checking       → model is generating (streaming in progress)
//   needs_download → model not downloaded; waiting for user gesture
//   downloading    → preloadDeviceModel or downloadAndCheck in progress
//   masking        → running detectEntities() before showing cloud SendPreview
//   send_preview   → SendPreview shown for the first cloud check
//   done           → result is ready
//   error          → an error occurred
//
// Agent (investigation) state machine:
//   idle | masking | send_preview | running

export default function App() {
  const [page, setPage] = useState(
    () => window.location.hash === '#/accuracy' ? 'dashboard' : 'check'
  );

  useEffect(() => {
    const handleHash = () =>
      setPage(window.location.hash === '#/accuracy' ? 'dashboard' : 'check');
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const [appState, setAppState] = useState('idle');
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [availability, setAvailability] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [devOpen, setDevOpen] = useState(false);

  // ── Live check progress ────────────────────────────────────────────────────
  const [checkStartTime, setCheckStartTime] = useState(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [charsReceived, setCharsReceived] = useState(0);

  // ── Cloud send-preview state (first check path) ────────────────────────────
  const [maskData, setMaskData] = useState(null); // { entities, regexOnly }

  // ── Agent (investigation) state ────────────────────────────────────────────
  // 'idle' | 'masking' | 'send_preview' | 'running'
  const [investigateState, setInvestigateState] = useState('idle');
  const [investigateMaskData, setInvestigateMaskData] = useState(null);
  const [investigateMaskedText, setInvestigateMaskedText] = useState(null);
  const [investigateVerdict, setInvestigateVerdict] = useState(null);

  // ── Instant rules preview ──────────────────────────────────────────────────
  const [preliminarySignals, setPreliminarySignals] = useState(null);

  // Tick elapsed time every 100 ms while a check is running
  useEffect(() => {
    if (!checkStartTime) return;
    const id = setInterval(() => setElapsedMs(Date.now() - checkStartTime), 100);
    return () => clearInterval(id);
  }, [checkStartTime]);

  // ── Availability + warm-up ─────────────────────────────────────────────────
  useEffect(() => {
    getOnDeviceAvailability().then(setAvailability);
  }, []);

  useEffect(() => {
    if (availability === 'available') {
      warmUpDeviceModel();
    }
  }, [availability]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  function startProgress() {
    setCheckStartTime(Date.now());
    setCharsReceived(0);
  }

  function stopProgress() {
    setCheckStartTime(null);
  }

  function handleTextChange(newText) {
    setText(newText);
    if (
      appState === 'done' || appState === 'error' ||
      appState === 'send_preview' || appState === 'masking' ||
      appState === 'needs_download'
    ) {
      setAppState('idle');
      setResult(null);
      setErrorMsg('');
      setMaskData(null);
    }
    setInvestigateState('idle');
    setInvestigateMaskData(null);
    setInvestigateMaskedText(null);
    setInvestigateVerdict(null);
    setPreliminarySignals(null);
  }

  function handleClear() {
    setText('');
    setAppState('idle');
    setResult(null);
    setErrorMsg('');
    setMaskData(null);
    setInvestigateState('idle');
    setInvestigateMaskData(null);
    setInvestigateMaskedText(null);
    setInvestigateVerdict(null);
    setPreliminarySignals(null);
  }

  // ── Main check entry point ─────────────────────────────────────────────────

  async function handleCheck() {
    if (!text.trim()) return;
    const instant = analyzeSignals(text.trim());
    setAppState('checking');
    setResult(null);
    setErrorMsg('');
    setMaskData(null);
    setInvestigateState('idle');
    setInvestigateMaskData(null);
    setInvestigateMaskedText(null);
    setInvestigateVerdict(null);
    setPreliminarySignals(instant);
    startProgress();

    try {
      const outcome = await checkMessage(text, (chars) => setCharsReceived(chars));
      stopProgress();

      if (outcome.state === 'needs_download') {
        setAvailability(outcome.availability);
        setAppState('needs_download');
      } else if (outcome.state === 'needs_consent') {
        setAvailability(outcome.availability);
        // Start masking immediately (no consent dialog — go straight to SendPreview)
        setAppState('masking');
        try {
          const md = await detectEntities(text);
          setMaskData(md);
          setAppState('send_preview');
        } catch (err) {
          setErrorMsg(err?.message ?? 'Failed to prepare masked text. Please try again.');
          setAppState('error');
        }
      } else {
        setResult(outcome);
        if (outcome.source === 'on-device') setAvailability('available');
        setAppState('done');
      }
    } catch (err) {
      stopProgress();
      setErrorMsg(err?.message ?? 'An unexpected error occurred. Please try again.');
      setAppState('error');
    }
  }

  // ── Download & check ───────────────────────────────────────────────────────

  const handleDownloadAndCheck = useCallback(async () => {
    setAppState('downloading');
    setDownloadProgress(0);
    try {
      const outcome = await downloadAndCheck(
        text,
        (p) => setDownloadProgress(Math.round(p * 100)),
        (chars) => setCharsReceived(chars),
      );
      setResult(outcome);
      setAvailability('available');
      setAppState('done');
    } catch (err) {
      setErrorMsg(err?.message ?? 'Download failed. Please try again.');
      setAppState('error');
    }
  }, [text]);

  // ── Pre-download ───────────────────────────────────────────────────────────

  const handlePreload = useCallback(async () => {
    setAppState('downloading');
    setDownloadProgress(0);
    try {
      await preloadDeviceModel((p) => setDownloadProgress(Math.round(p * 100)));
      setAvailability('available');
      setAppState('idle');
    } catch (err) {
      setErrorMsg(err?.message ?? 'Download failed. Please try again.');
      setAppState('error');
    }
  }, []);

  // ── Cloud send-preview confirmed (first check path) ────────────────────────

  async function handleCloudSendConfirm(maskedText) {
    setAppState('checking');
    setMaskData(null);
    setResult(null);
    setErrorMsg('');
    startProgress();
    try {
      const outcome = await cloudCheck(text, (chars) => setCharsReceived(chars), maskedText);
      stopProgress();
      setResult(outcome);
      setAppState('done');
    } catch (err) {
      stopProgress();
      setErrorMsg(err?.message ?? 'Cloud check failed. Please try again.');
      setAppState('error');
    }
  }

  function handleCloudSendCancel() {
    setAppState('idle');
    setMaskData(null);
  }

  // ── Agent investigation flow ───────────────────────────────────────────────

  async function handleInvestigateRequest(verdictResult) {
    setInvestigateState('masking');
    setInvestigateMaskData(null);
    setInvestigateMaskedText(null);
    setInvestigateVerdict(verdictResult);
    try {
      const md = await detectEntities(text);
      setInvestigateMaskData(md);
      setInvestigateState('send_preview');
    } catch (err) {
      setInvestigateState('idle');
      console.error('[ScamShield] Investigation masking failed:', err?.message);
    }
  }

  function handleInvestigateSendConfirm(maskedText) {
    setInvestigateMaskedText(maskedText);
    setInvestigateMaskData(null);
    setInvestigateState('running');
  }

  function handleInvestigateSendCancel() {
    setInvestigateState('idle');
    setInvestigateMaskData(null);
  }

  function handleInvestigateClose() {
    setInvestigateState('idle');
    setInvestigateMaskedText(null);
    setInvestigateVerdict(null);
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const isChecking = appState === 'checking';
  const isDownloading = appState === 'downloading';

  const checkingLabel = availability === 'available'
    ? 'Analysing privately on your device…'
    : 'Analysing via cloud…';

  return (
    <div style={page === 'dashboard' ? styles.containerWide : styles.container}>
      {/* Navigation */}
      <nav style={styles.nav}>
        <span style={styles.navBrand}>{APP_NAME}</span>
        <div style={styles.navLinks}>
          <a
            href="#"
            style={page === 'check' ? styles.navLinkActive : styles.navLink}
          >
            Check a message
          </a>
          <a
            href="#/accuracy"
            style={page === 'dashboard' ? styles.navLinkActive : styles.navLink}
          >
            How accurate is it?
          </a>
        </div>
      </nav>

      {/* Dashboard page */}
      {page === 'dashboard' && <Dashboard />}

      {/* Check page */}
      {page === 'check' && <>

      {/* Header */}
      <header style={styles.header}>
        <h1 style={styles.title}>{APP_NAME}</h1>
        <p style={styles.subtitle}>
          Check if an SMS, WhatsApp or email message is a scam — privately, on your device.
        </p>
      </header>

      {/* On-device AI status banner */}
      <ModelStatus
        availability={isDownloading ? 'downloading' : availability}
        isDownloading={isDownloading}
        downloadProgress={downloadProgress}
        onDownloadRequest={handlePreload}
      />

      {/* Message input */}
      <MessageInput
        value={text}
        onChange={handleTextChange}
        onCheck={handleCheck}
        onClear={handleClear}
        disabled={isChecking || isDownloading}
      />

      {/* Instant rules preview — shown while AI is running */}
      {preliminarySignals && appState === 'checking' && (
        <PreliminaryCard signals={preliminarySignals} />
      )}

      {/* Live progress indicator while checking */}
      {isChecking && (
        <div style={styles.progressBox}>
          <span style={styles.progressDot} />
          <span style={styles.progressText}>{checkingLabel}</span>
          <span style={styles.progressStats}>
            {charsReceived > 0 && `${charsReceived} chars · `}
            {(elapsedMs / 1000).toFixed(1)}s
          </span>
        </div>
      )}

      {/* Masking progress (before showing SendPreview) */}
      {(appState === 'masking' || investigateState === 'masking') && (
        <div style={styles.maskingBox}>
          <span style={styles.progressDot} />
          <span style={styles.progressText}>Detecting personal details on your device…</span>
        </div>
      )}

      {/* Download-and-check prompt */}
      {appState === 'needs_download' && (
        <div style={styles.downloadPrompt}>
          <p style={styles.downloadPromptText}>
            The private AI model needs to be downloaded before checking your message.
            This is a one-time download.
          </p>
          {isDownloading && (
            <div style={styles.progressRow}>
              <div style={styles.progressTrack}>
                <div style={{ ...styles.progressFill, width: `${downloadProgress}%` }} />
              </div>
              <span style={styles.progressLabel}>{downloadProgress}%</span>
            </div>
          )}
          {!isDownloading && (
            <button style={styles.dlBtn} onClick={handleDownloadAndCheck} type="button">
              Download and check
            </button>
          )}
        </div>
      )}

      {/* Send preview — first cloud check */}
      {appState === 'send_preview' && maskData && (
        <div style={styles.sendPreviewWrap}>
          <SendPreview
            originalText={text}
            entities={maskData.entities}
            regexOnly={maskData.regexOnly}
            onSend={handleCloudSendConfirm}
            onCancel={handleCloudSendCancel}
          />
        </div>
      )}

      {/* Error */}
      {appState === 'error' && errorMsg && (
        <div style={styles.errorBox}>
          <strong>Error: </strong>{errorMsg}
        </div>
      )}

      {/* Main result */}
      {appState === 'done' && result && (
        <div style={styles.resultWrap}>
          <VerdictCard
            result={result}
            originalText={text}
            onInvestigate={investigateState === 'idle' ? () => handleInvestigateRequest(result) : undefined}
          />
        </div>
      )}

      {/* Agent — send preview */}
      {investigateState === 'send_preview' && investigateMaskData && (
        <div style={styles.sendPreviewWrap}>
          <SendPreview
            originalText={text}
            entities={investigateMaskData.entities}
            regexOnly={investigateMaskData.regexOnly}
            onSend={handleInvestigateSendConfirm}
            onCancel={handleInvestigateSendCancel}
          />
        </div>
      )}

      {/* Agent panel */}
      {investigateState === 'running' && investigateMaskedText && (
        <div style={styles.investigateWrap}>
          <AgentPanel
            maskedText={investigateMaskedText}
            deviceVerdict={investigateVerdict}
            signals={preliminarySignals}
            onClose={handleInvestigateClose}
          />
        </div>
      )}

      {/* Developer tools — collapsed by default */}
      <div style={styles.devSection}>
        <button
          style={styles.devToggle}
          onClick={() => setDevOpen((o) => !o)}
          type="button"
          aria-expanded={devOpen}
        >
          {devOpen ? '▾' : '▸'} Developer tools
        </button>
        {devOpen && (
          <div style={styles.devContent}>
            <DevTestPanel />
            <div style={styles.devAgentRow}>
              <button
                style={styles.devBtn}
                type="button"
                onClick={() => { runAgentTests(); }}
              >
                Run analyzeLink tests
              </button>
              <button
                style={styles.devBtn}
                type="button"
                onClick={() => { runAgentDemo(); }}
              >
                Run agent demo (msg #1)
              </button>
            </div>
            <TestRunner />
          </div>
        )}
      </div>

      </>}
    </div>
  );
}

function PreliminaryCard({ signals }) {
  const riskSignals = signals.signals.filter((s) => s.weight > 0 && s.phrase);
  const seen = new Set();
  const unique = riskSignals.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
  const count = unique.length;

  return (
    <div style={prelStyles.box}>
      <div style={prelStyles.header}>
        {count > 0
          ? `⚡ ${count} warning sign${count > 1 ? 's' : ''} detected instantly`
          : '⚡ No obvious warning signs — AI review in progress…'}
      </div>
      {unique.length > 0 && (
        <ul style={prelStyles.list}>
          {unique.slice(0, 4).map((s) => (
            <li key={s.id} style={prelStyles.item}>
              <span style={prelStyles.label}>{s.label}</span>
              {s.phrase && <span style={prelStyles.phrase}>"{s.phrase}"</span>}
            </li>
          ))}
        </ul>
      )}
      {count > 0 && <div style={prelStyles.footer}>AI review in progress…</div>}
    </div>
  );
}

const prelStyles = {
  box: {
    background: '#fffbeb',
    border: '1px solid #fcd34d',
    borderRadius: 8,
    padding: '12px 16px',
    marginTop: 12,
  },
  header: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#92400e',
  },
  list: {
    margin: '8px 0 4px',
    paddingLeft: 18,
  },
  item: {
    fontSize: '0.82rem',
    color: '#78350f',
    marginBottom: 3,
  },
  label: {
    fontWeight: 600,
    marginRight: 6,
  },
  phrase: {
    fontStyle: 'italic',
    opacity: 0.85,
  },
  footer: {
    fontSize: '0.75rem',
    color: '#a16207',
    marginTop: 6,
  },
};

const styles = {
  container: {
    maxWidth: 680,
    margin: '0 auto',
    padding: '0 20px 60px',
  },
  containerWide: {
    margin: '0 auto',
    padding: '0 0 60px',
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: 20,
    padding: '14px 20px',
    borderBottom: '1px solid #e5e7eb',
    marginBottom: 32,
    flexWrap: 'wrap',
  },
  navBrand: {
    fontWeight: 700,
    fontSize: '1rem',
    color: '#111827',
    marginRight: 'auto',
  },
  navLinks: {
    display: 'flex',
    gap: 4,
  },
  navLink: {
    padding: '6px 14px',
    fontSize: '0.875rem',
    color: '#6b7280',
    textDecoration: 'none',
    borderRadius: 6,
    fontWeight: 500,
  },
  navLinkActive: {
    padding: '6px 14px',
    fontSize: '0.875rem',
    color: '#1d4ed8',
    textDecoration: 'none',
    borderRadius: 6,
    fontWeight: 700,
    background: '#eff6ff',
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: '1.75rem',
    marginBottom: 6,
  },
  subtitle: {
    color: '#6b7280',
    fontSize: '0.95rem',
    margin: 0,
    lineHeight: 1.5,
  },
  progressBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    marginTop: 12,
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: 8,
    fontSize: '0.875rem',
    color: '#1e3a8a',
  },
  maskingBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    marginTop: 12,
    background: '#f0fdf4',
    border: '1px solid #bbf7d0',
    borderRadius: 8,
    fontSize: '0.875rem',
    color: '#14532d',
  },
  progressDot: {
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#3b82f6',
    animation: 'pulse 1.2s ease-in-out infinite',
    flexShrink: 0,
  },
  progressText: {
    flex: 1,
  },
  progressStats: {
    fontSize: '0.82rem',
    opacity: 0.8,
    whiteSpace: 'nowrap',
  },
  downloadPrompt: {
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: 8,
    padding: '14px 16px',
    marginTop: 14,
  },
  downloadPromptText: {
    margin: '0 0 12px',
    fontSize: '0.875rem',
    color: '#1e3a8a',
    lineHeight: 1.5,
  },
  progressRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    background: '#bfdbfe',
    borderRadius: 99,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: '#1d4ed8',
    borderRadius: 99,
    transition: 'width 0.3s ease',
  },
  progressLabel: {
    fontSize: '0.82rem',
    color: '#1e3a8a',
    minWidth: 36,
    textAlign: 'right',
  },
  dlBtn: {
    padding: '8px 18px',
    fontSize: '0.875rem',
    fontWeight: 600,
    background: '#1d4ed8',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  sendPreviewWrap: {
    marginTop: 16,
  },
  errorBox: {
    background: '#fef2f2',
    border: '1px solid #fca5a5',
    borderRadius: 8,
    padding: '12px 16px',
    marginTop: 14,
    fontSize: '0.875rem',
    color: '#991b1b',
    lineHeight: 1.5,
  },
  resultWrap: {
    marginTop: 20,
  },
  investigateWrap: {
    marginTop: 20,
  },
  devSection: {
    marginTop: 48,
    borderTop: '1px solid #e5e7eb',
    paddingTop: 20,
  },
  devAgentRow: {
    display: 'flex',
    gap: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  devBtn: {
    padding: '6px 12px',
    fontSize: '0.8rem',
    background: '#f3f4f6',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: 'inherit',
    color: '#374151',
  },
  devToggle: {
    background: 'none',
    border: 'none',
    color: '#9ca3af',
    fontSize: '0.875rem',
    cursor: 'pointer',
    padding: 0,
    fontFamily: 'inherit',
  },
  devContent: {
    marginTop: 8,
  },
};
