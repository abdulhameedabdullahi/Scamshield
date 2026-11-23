import { useState, useEffect, useCallback } from 'react';
import { APP_NAME } from './config';
import { getOnDeviceAvailability } from './ai/availability';
import {
  checkMessage, downloadAndCheck, cloudCheck,
  preloadDeviceModel, warmUpDeviceModel,
} from './ai/checkMessage';
import ModelStatus from './components/ModelStatus';
import MessageInput from './components/MessageInput';
import VerdictCard from './components/VerdictCard';
import ConsentDialog from './components/ConsentDialog';
import DevTestPanel from './components/DevTestPanel';
import TestRunner from './dev/TestRunner';

// App-level state machine:
//   idle           → waiting for user to type and click Check
//   checking       → model is generating (streaming in progress)
//   needs_download → model not downloaded; waiting for user gesture
//   downloading    → preloadDeviceModel or downloadAndCheck in progress
//   needs_consent  → on-device unavailable; waiting for consent to cloud check
//   done           → result is ready
//   error          → an error occurred

export default function App() {
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

  // ── Second opinion state ───────────────────────────────────────────────────
  // 'idle' | 'consent_pending' | 'checking' | 'done' | 'error'
  const [secondOpinionState, setSecondOpinionState] = useState('idle');
  const [secondResult, setSecondResult] = useState(null);
  const [secondErrorMsg, setSecondErrorMsg] = useState('');

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
      appState === 'needs_consent' || appState === 'needs_download'
    ) {
      setAppState('idle');
      setResult(null);
      setErrorMsg('');
    }
    // Clear second opinion when text changes
    setSecondOpinionState('idle');
    setSecondResult(null);
    setSecondErrorMsg('');
  }

  function handleClear() {
    setText('');
    setAppState('idle');
    setResult(null);
    setErrorMsg('');
    setSecondOpinionState('idle');
    setSecondResult(null);
    setSecondErrorMsg('');
  }

  // ── Main check entry point ─────────────────────────────────────────────────

  async function handleCheck() {
    if (!text.trim()) return;
    setAppState('checking');
    setResult(null);
    setErrorMsg('');
    setSecondOpinionState('idle');
    setSecondResult(null);
    setSecondErrorMsg('');
    startProgress();

    try {
      const outcome = await checkMessage(text, (chars) => setCharsReceived(chars));
      stopProgress();

      if (outcome.state === 'needs_download') {
        setAvailability(outcome.availability);
        setAppState('needs_download');
      } else if (outcome.state === 'needs_consent') {
        setAvailability(outcome.availability);
        setAppState('needs_consent');
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

  // ── Cloud consent path (first check) ──────────────────────────────────────

  async function handleConsent() {
    setAppState('checking');
    setResult(null);
    setErrorMsg('');
    startProgress();
    try {
      const outcome = await cloudCheck(text, (chars) => setCharsReceived(chars));
      stopProgress();
      setResult(outcome);
      setAppState('done');
    } catch (err) {
      stopProgress();
      setErrorMsg(err?.message ?? 'Cloud check failed. Please try again.');
      setAppState('error');
    }
  }

  function handleDecline() {
    setAppState('idle');
  }

  // ── Second opinion flow ────────────────────────────────────────────────────

  function handleSecondOpinionRequest() {
    setSecondOpinionState('consent_pending');
    setSecondResult(null);
    setSecondErrorMsg('');
  }

  async function handleSecondOpinionConsent() {
    setSecondOpinionState('checking');
    try {
      const outcome = await cloudCheck(text, (chars) => setCharsReceived(chars));
      setSecondResult(outcome);
      setSecondOpinionState('done');
    } catch (err) {
      setSecondErrorMsg(err?.message ?? 'Cloud check failed. Please try again.');
      setSecondOpinionState('error');
    }
  }

  function handleSecondOpinionDecline() {
    setSecondOpinionState('idle');
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const isChecking = appState === 'checking';
  const isDownloading = appState === 'downloading';
  const isSecondChecking = secondOpinionState === 'checking';

  const checkingLabel = availability === 'available'
    ? 'Analysing privately on your device…'
    : 'Analysing via cloud…';

  return (
    <div style={styles.container}>
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

      {/* Consent gate — first cloud check */}
      {appState === 'needs_consent' && (
        <ConsentDialog onConsent={handleConsent} onDecline={handleDecline} />
      )}

      {/* Consent gate — second opinion */}
      {secondOpinionState === 'consent_pending' && (
        <div style={styles.secondConsentWrap}>
          <ConsentDialog
            onConsent={handleSecondOpinionConsent}
            onDecline={handleSecondOpinionDecline}
          />
        </div>
      )}

      {/* Message input */}
      <MessageInput
        value={text}
        onChange={handleTextChange}
        onCheck={handleCheck}
        onClear={handleClear}
        disabled={isChecking || isDownloading}
      />

      {/* Live progress indicator while checking */}
      {(isChecking || isSecondChecking) && (
        <div style={styles.progressBox}>
          <span style={styles.progressDot} />
          <span style={styles.progressText}>
            {isSecondChecking ? 'Getting second opinion via cloud…' : checkingLabel}
          </span>
          <span style={styles.progressStats}>
            {charsReceived > 0 && `${charsReceived} chars · `}
            {(elapsedMs / 1000).toFixed(1)}s
          </span>
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
            onSecondOpinion={secondOpinionState === 'idle' ? handleSecondOpinionRequest : undefined}
          />
        </div>
      )}

      {/* Second opinion error */}
      {secondOpinionState === 'error' && secondErrorMsg && (
        <div style={{ ...styles.errorBox, marginTop: 12 }}>
          <strong>Second opinion error: </strong>{secondErrorMsg}
        </div>
      )}

      {/* Second opinion result */}
      {secondOpinionState === 'done' && secondResult && (
        <div style={styles.secondResultWrap}>
          <div style={styles.secondResultHeader}>Second opinion from cloud</div>
          <VerdictCard result={secondResult} originalText={text} />
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
            <TestRunner />
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: 680,
    margin: '40px auto',
    padding: '0 20px 60px',
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
  secondConsentWrap: {
    marginTop: 12,
  },
  secondResultWrap: {
    marginTop: 20,
  },
  secondResultHeader: {
    fontSize: '0.82rem',
    fontWeight: 700,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 8,
  },
  devSection: {
    marginTop: 48,
    borderTop: '1px solid #e5e7eb',
    paddingTop: 20,
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
