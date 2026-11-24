import { useState, useEffect, useCallback, useRef } from 'react';
import { getOnDeviceAvailability } from './ai/availability';
import {
  checkMessage, downloadAndCheck, cloudCheck,
  preloadDeviceModel, warmUpDeviceModel,
} from './ai/checkMessage';
import { analyzeSignals } from './ai/rules';
import { detectEntities } from './ai/maskMessage';
import Logo from './components/Logo';
import ModelStatus from './components/ModelStatus';
import MessageInput from './components/MessageInput';
import VerdictCard from './components/VerdictCard';
import SendPreview from './components/SendPreview';
import AgentPanel from './components/AgentPanel';
import DevTestPanel from './components/DevTestPanel';
import TestRunner from './dev/TestRunner';
import { runAgentTests, runAgentDemo } from './dev/agentTest';
import Dashboard from './components/dashboard/Dashboard';
import PrivacyPage from './components/pages/PrivacyPage';
import AboutPage from './components/pages/AboutPage';
import { Menu, X } from 'lucide-react';

// ── Routing ────────────────────────────────────────────────────────────────

function hashToPage(hash) {
  if (hash === '#/accuracy') return 'dashboard';
  if (hash === '#/privacy')  return 'privacy';
  if (hash === '#/about')    return 'about';
  return 'check';
}

// ── Example messages ───────────────────────────────────────────────────────

const EXAMPLES = [
  {
    label: 'Bank alert',
    text: 'ALERT: Your GTBank account has been debited N150,000. If you did not authorise this, click here to reverse: http://gtbnk-verify.com/secure',
  },
  {
    label: 'Job offer',
    text: 'Congratulations! You have been selected for a remote data-entry job. Salary: N80,000/month. Pay N5,000 registration fee to get started. Reply YES.',
  },
  {
    label: 'BVN threat',
    text: 'CBN NOTICE: Your BVN has been flagged for suspicious activity. Update your BVN immediately at www.cbn-bvn-update.net or your accounts will be frozen within 24 hours.',
  },
];

// ── App ────────────────────────────────────────────────────────────────────

export default function App() {
  const [page, setPage] = useState(() => hashToPage(window.location.hash));
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onHash = () => setPage(hashToPage(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  function navigate(hash) {
    window.location.hash = hash;
    setPage(hashToPage(hash));
    setMenuOpen(false);
  }

  // ── Check page state ──────────────────────────────────────────────────────

  const [appState, setAppState]             = useState('idle');
  const [text, setText]                     = useState('');
  const [result, setResult]                 = useState(null);
  const [errorMsg, setErrorMsg]             = useState('');
  const [availability, setAvailability]     = useState(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [devOpen, setDevOpen]               = useState(false);
  const [checkStartTime, setCheckStartTime] = useState(null);
  const [maskData, setMaskData]             = useState(null);

  // Agent state
  const [investigateState, setInvestigateState]     = useState('idle');
  const [investigateMaskData, setInvestigateMaskData] = useState(null);
  const [investigateMaskedText, setInvestigateMaskedText] = useState(null);
  const [investigateVerdict, setInvestigateVerdict] = useState(null);

  // Instant rule preview
  const [preliminarySignals, setPreliminarySignals] = useState(null);

  // Scroll
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!checkStartTime) return;
    const id = setInterval(() => {}, 100);
    return () => clearInterval(id);
  }, [checkStartTime]);

  useEffect(() => {
    getOnDeviceAvailability().then(setAvailability);
  }, []);

  useEffect(() => {
    if (availability === 'available') warmUpDeviceModel();
  }, [availability]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [appState, investigateState, result]);

  function startProgress() { setCheckStartTime(Date.now()); }
  function stopProgress()  { setCheckStartTime(null); }

  function handleTextChange(newText) {
    setText(newText);
    if (
      appState === 'done' || appState === 'error' ||
      appState === 'send_preview' || appState === 'masking' ||
      appState === 'needs_download'
    ) {
      setAppState('idle'); setResult(null); setErrorMsg(''); setMaskData(null);
    }
    setInvestigateState('idle');
    setInvestigateMaskData(null);
    setInvestigateMaskedText(null);
    setInvestigateVerdict(null);
    setPreliminarySignals(null);
  }

  function handleClear() {
    setText(''); setAppState('idle'); setResult(null); setErrorMsg('');
    setMaskData(null); setInvestigateState('idle'); setInvestigateMaskData(null);
    setInvestigateMaskedText(null); setInvestigateVerdict(null);
    setPreliminarySignals(null);
  }

  async function handleCheck() {
    if (!text.trim()) return;
    const instant = analyzeSignals(text.trim());
    setAppState('checking'); setResult(null); setErrorMsg(''); setMaskData(null);
    setInvestigateState('idle'); setInvestigateMaskData(null);
    setInvestigateMaskedText(null); setInvestigateVerdict(null);
    setPreliminarySignals(instant);
    startProgress();
    try {
      const outcome = await checkMessage(text, () => {});
      stopProgress();
      if (outcome.state === 'needs_download') {
        setAvailability(outcome.availability); setAppState('needs_download');
      } else if (outcome.state === 'needs_consent') {
        setAvailability(outcome.availability); setAppState('masking');
        try {
          const md = await detectEntities(text);
          setMaskData(md); setAppState('send_preview');
        } catch (err) {
          setErrorMsg(err?.message ?? 'Couldn\'t prepare message. Please try again.');
          setAppState('error');
        }
      } else {
        setResult(outcome);
        if (outcome.source === 'on-device') setAvailability('available');
        setAppState('done');
      }
    } catch (err) {
      stopProgress();
      setErrorMsg(err?.message ?? 'Something went wrong. Please try again.');
      setAppState('error');
    }
  }

  const handleDownloadAndCheck = useCallback(async () => {
    setAppState('downloading'); setDownloadProgress(0);
    try {
      const outcome = await downloadAndCheck(
        text,
        (p) => setDownloadProgress(Math.round(p * 100)),
        () => {},
      );
      setResult(outcome); setAvailability('available'); setAppState('done');
    } catch (err) {
      setErrorMsg(err?.message ?? 'Download failed. Please try again.'); setAppState('error');
    }
  }, [text]);

  const handlePreload = useCallback(async () => {
    setAppState('downloading'); setDownloadProgress(0);
    try {
      await preloadDeviceModel((p) => setDownloadProgress(Math.round(p * 100)));
      setAvailability('available'); setAppState('idle');
    } catch (err) {
      setErrorMsg(err?.message ?? 'Download failed. Please try again.'); setAppState('error');
    }
  }, []);

  async function handleCloudSendConfirm(maskedText) {
    setAppState('checking'); setMaskData(null); setResult(null); setErrorMsg('');
    startProgress();
    try {
      const outcome = await cloudCheck(text, () => {}, maskedText);
      stopProgress(); setResult(outcome); setAppState('done');
    } catch (err) {
      stopProgress();
      setErrorMsg(err?.message ?? 'Couldn\'t check online. Check your internet and try again.');
      setAppState('error');
    }
  }

  function handleCloudSendCancel() { setAppState('idle'); setMaskData(null); }

  async function handleInvestigateRequest(verdictResult) {
    setInvestigateState('masking'); setInvestigateMaskData(null);
    setInvestigateMaskedText(null); setInvestigateVerdict(verdictResult);
    try {
      const md = await detectEntities(text);
      setInvestigateMaskData(md); setInvestigateState('send_preview');
    } catch (err) {
      setInvestigateState('idle');
      console.error('[ScamShield] Masking failed:', err?.message);
    }
  }

  function handleInvestigateSendConfirm(maskedText) {
    setInvestigateMaskedText(maskedText);
    setInvestigateMaskData(null);
    setInvestigateState('running');
  }

  function handleInvestigateSendCancel() {
    setInvestigateState('idle'); setInvestigateMaskData(null);
  }

  function handleInvestigateClose() {
    setInvestigateState('idle');
    setInvestigateMaskedText(null);
    setInvestigateVerdict(null);
  }

  const isChecking   = appState === 'checking';
  const isDownloading = appState === 'downloading';
  const isDev = import.meta.env.DEV || window.location.hash.includes('dev');
  const hasConversation = !!(text || result || appState !== 'idle');

  const checkingLabel = availability === 'available'
    ? 'Reading your message on this phone…'
    : 'Analysing with personal details hidden…';

  const riskSignals = (preliminarySignals?.signals ?? []).filter(
    (s) => s.weight > 0 && s.phrase,
  );
  const uniqueSignals = [...new Map(riskSignals.map((s) => [s.id, s])).values()];

  return (
    <div className="app-shell">

      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <header className="topbar">
        <a
          href="#"
          onClick={(e) => { e.preventDefault(); navigate('#'); }}
          style={S.brandLink}
          aria-label="ScamShield — go to home"
        >
          <Logo size={28} color="#EFE8F4" />
          <span style={S.brandName}>ScamShield</span>
        </a>

        {hasConversation && page === 'check' && (
          <button style={S.newCheckBtn} onClick={handleClear} type="button">
            New check
          </button>
        )}

        <button
          style={S.menuBtn}
          onClick={() => setMenuOpen(true)}
          type="button"
          aria-label="Open menu"
          aria-expanded={menuOpen}
        >
          <Menu size={22} color="#EFE8F4" strokeWidth={1.75} />
        </button>
      </header>

      {/* ── Menu overlay ──────────────────────────────────────────────────── */}
      {menuOpen && (
        <div
          className="menu-overlay"
          onClick={() => setMenuOpen(false)}
          role="dialog"
          aria-label="Navigation menu"
          aria-modal="true"
        >
          <div
            className="menu-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <div style={S.menuHeader}>
              <span style={S.menuTitle}>Menu</span>
              <button
                style={S.menuClose}
                onClick={() => setMenuOpen(false)}
                type="button"
                aria-label="Close menu"
              >
                <X size={20} strokeWidth={1.75} />
              </button>
            </div>
            <nav style={S.menuNav} aria-label="Site navigation">
              <MenuLink
                label="Check a message"
                href="#"
                active={page === 'check'}
                onClick={() => navigate('#')}
              />
              <MenuLink
                label="How accurate is it?"
                href="#/accuracy"
                active={page === 'dashboard'}
                onClick={() => navigate('#/accuracy')}
              />
              <MenuLink
                label="How your privacy is protected"
                href="#/privacy"
                active={page === 'privacy'}
                onClick={() => navigate('#/privacy')}
              />
              <MenuLink
                label="About ScamShield"
                href="#/about"
                active={page === 'about'}
                onClick={() => navigate('#/about')}
              />
              {isDev && (
                <>
                  <div style={S.menuDivider} />
                  <MenuLink
                    label="Developer tools"
                    href="#dev"
                    onClick={() => { setMenuOpen(false); setDevOpen(true); navigate('#'); }}
                  />
                </>
              )}
            </nav>
          </div>
        </div>
      )}

      {/* ── Pages ─────────────────────────────────────────────────────────── */}

      {page === 'dashboard' && (
        <div className="page-scroll">
          <Dashboard />
        </div>
      )}
      {page === 'privacy' && <PrivacyPage />}
      {page === 'about'   && <AboutPage />}

      {/* ── Check page ────────────────────────────────────────────────────── */}
      {page === 'check' && (
        <main className="check-main">

          {/* Model status strip */}
          <ModelStatus
            availability={isDownloading ? 'downloading' : availability}
            isDownloading={isDownloading}
            downloadProgress={downloadProgress}
            onDownloadRequest={handlePreload}
          />

          {/* Chat thread */}
          <div className="chat-thread">
            <div className="chat-inner">

              {/* ── Welcome state ── */}
              {!text && appState === 'idle' && !result && (
                <>
                  <WelcomeBubble />
                  <div style={S.exampleRow} role="list" aria-label="Example messages">
                    {EXAMPLES.map((ex) => (
                      <button
                        key={ex.label}
                        style={S.exampleChip}
                        type="button"
                        role="listitem"
                        onClick={() => handleTextChange(ex.text)}
                      >
                        Try: {ex.label}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* ── User message bubble ── */}
              {text && appState !== 'idle' && (
                <div style={S.userRow} aria-label="Your message">
                  <div style={S.userBubble}>{text}</div>
                </div>
              )}

              {/* ── Preliminary signals while checking ── */}
              {uniqueSignals.length > 0 && appState === 'checking' && (
                <PrelimBubble signals={uniqueSignals} />
              )}

              {/* ── Typing indicator ── */}
              {appState === 'checking' && (
                <TypingBubble label={checkingLabel} />
              )}
              {appState === 'masking' && (
                <TypingBubble label="Hiding your personal details on this phone…" />
              )}
              {investigateState === 'masking' && (
                <TypingBubble label="Hiding your personal details on this phone…" />
              )}

              {/* ── Download needed ── */}
              {appState === 'needs_download' && (
                <DownloadCard
                  isDownloading={isDownloading}
                  downloadProgress={downloadProgress}
                  onDownload={handleDownloadAndCheck}
                />
              )}

              {/* ── First check send preview ── */}
              {appState === 'send_preview' && maskData && (
                <SendPreview
                  originalText={text}
                  entities={maskData.entities}
                  regexOnly={maskData.regexOnly}
                  onSend={handleCloudSendConfirm}
                  onCancel={handleCloudSendCancel}
                />
              )}

              {/* ── Error ── */}
              {appState === 'error' && errorMsg && (
                <div style={S.errorBubble} role="alert" aria-live="assertive">
                  <strong>Couldn't check the message.</strong> {errorMsg}
                </div>
              )}

              {/* ── Result ── */}
              {appState === 'done' && result && (
                <VerdictCard
                  result={result}
                  originalText={text}
                  onInvestigate={
                    investigateState === 'idle'
                      ? () => handleInvestigateRequest(result)
                      : undefined
                  }
                />
              )}

              {/* ── Agent: send preview ── */}
              {investigateState === 'send_preview' && investigateMaskData && (
                <SendPreview
                  originalText={text}
                  entities={investigateMaskData.entities}
                  regexOnly={investigateMaskData.regexOnly}
                  onSend={handleInvestigateSendConfirm}
                  onCancel={handleInvestigateSendCancel}
                />
              )}

              {/* ── Agent panel ── */}
              {investigateState === 'running' && investigateMaskedText && (
                <AgentPanel
                  maskedText={investigateMaskedText}
                  deviceVerdict={investigateVerdict}
                  signals={preliminarySignals}
                  onClose={handleInvestigateClose}
                />
              )}

              {/* ── Dev tools (collapsed) ── */}
              {isDev && (
                <div style={S.devSection}>
                  <button
                    style={S.devToggle}
                    onClick={() => setDevOpen((o) => !o)}
                    type="button"
                    aria-expanded={devOpen}
                  >
                    {devOpen ? '▾' : '▸'} Developer tools
                  </button>
                  {devOpen && (
                    <div style={S.devContent}>
                      <DevTestPanel />
                      <div style={S.devRow}>
                        <button style={S.devBtn} type="button" onClick={() => runAgentTests()}>
                          Run link tests
                        </button>
                        <button style={S.devBtn} type="button" onClick={() => runAgentDemo()}>
                          Run agent demo
                        </button>
                      </div>
                      <TestRunner />
                    </div>
                  )}
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          </div>

          {/* ── Pinned composer ── */}
          <div className="composer-wrap">
            <div className="composer-inner">
              <MessageInput
                value={text}
                onChange={handleTextChange}
                onCheck={handleCheck}
                onClear={handleClear}
                disabled={isChecking || isDownloading}
              />
            </div>
          </div>

        </main>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function WelcomeBubble() {
  return (
    <div style={S.welcomeBubble} role="status">
      <p style={S.welcomeText}>
        Hi! Paste any message you're unsure about — a WhatsApp message, SMS or email.
        I'll check it on your phone first. Nothing is uploaded unless you say so.
      </p>
      <p style={{ ...S.welcomeText, marginTop: 8, opacity: 0.75 }}>
        Check any message before you trust it.
      </p>
    </div>
  );
}

function PrelimBubble({ signals }) {
  const count = signals.length;
  return (
    <div style={S.prelimBubble} role="status" aria-live="polite">
      <div style={S.prelimHeading}>
        {count > 0
          ? `I can already see ${count} warning sign${count > 1 ? 's' : ''}:`
          : 'No obvious warning signs yet — still checking…'}
      </div>
      {count > 0 && (
        <ul style={S.prelimList}>
          {signals.slice(0, 4).map((s) => (
            <li key={s.id} style={S.prelimItem}>
              <strong>{s.label}</strong>
              {s.phrase && <span style={S.prelimPhrase}> — "{s.phrase}"</span>}
            </li>
          ))}
        </ul>
      )}
      <div style={S.prelimFooter}>AI review in progress…</div>
    </div>
  );
}

function TypingBubble({ label }) {
  return (
    <div style={S.typingBubble} aria-live="polite" aria-label={label}>
      <div className="typing-dots">
        <div className="typing-dot" />
        <div className="typing-dot" />
        <div className="typing-dot" />
      </div>
      {label && <span style={S.typingLabel}>{label}</span>}
    </div>
  );
}

function DownloadCard({ isDownloading, downloadProgress, onDownload }) {
  return (
    <div style={S.downloadCard} role="region" aria-label="Download private checker">
      <p style={S.downloadText}>
        To check this message privately on your phone, you need to download the private checker
        once. It stays on your phone and works offline after that.
      </p>
      {isDownloading ? (
        <div style={S.dlProgressRow}>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${downloadProgress}%` }} />
          </div>
          <span style={S.dlPct}>{downloadProgress}%</span>
        </div>
      ) : (
        <button style={S.dlBtn} onClick={onDownload} type="button">
          Download and check
        </button>
      )}
    </div>
  );
}

function MenuLink({ label, href, active, onClick }) {
  return (
    <a
      href={href}
      style={{ ...S.menuLink, ...(active ? S.menuLinkActive : {}) }}
      onClick={(e) => { e.preventDefault(); onClick?.(); }}
      aria-current={active ? 'page' : undefined}
    >
      {label}
    </a>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const S = {
  /* Top bar */
  brandLink: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    textDecoration: 'none',
    flex: 1,
  },
  brandName: {
    fontFamily: 'var(--font-heading)',
    fontSize: '1.125rem',
    fontWeight: 600,
    color: '#EFE8F4',
    letterSpacing: '-0.01em',
  },
  newCheckBtn: {
    padding: '6px 14px',
    fontSize: '0.875rem',
    fontWeight: 600,
    background: 'rgba(239,232,244,0.15)',
    color: '#EFE8F4',
    border: '1px solid rgba(239,232,244,0.3)',
    borderRadius: 'var(--r-btn)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    flexShrink: 0,
    minHeight: 36,
  },
  menuBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    flexShrink: 0,
  },

  /* Menu */
  menuHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '18px 20px 12px',
    borderBottom: '1px solid var(--line)',
  },
  menuTitle: {
    fontFamily: 'var(--font-heading)',
    fontSize: '1.0625rem',
    color: 'var(--plum-900)',
  },
  menuClose: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: 6,
    color: 'var(--ink)',
    borderRadius: 8,
  },
  menuNav: {
    display: 'flex',
    flexDirection: 'column',
    padding: '12px 0',
  },
  menuLink: {
    display: 'block',
    padding: '14px 20px',
    fontSize: '1rem',
    color: 'var(--ink)',
    textDecoration: 'none',
    borderLeft: '3px solid transparent',
    lineHeight: 1.4,
  },
  menuLinkActive: {
    color: 'var(--plum-700)',
    fontWeight: 700,
    borderLeftColor: 'var(--plum-700)',
    background: 'var(--plum-100)',
  },
  menuDivider: {
    height: 1,
    background: 'var(--line)',
    margin: '8px 20px',
  },

  /* Welcome */
  welcomeBubble: {
    padding: '16px 18px',
    background: 'var(--plum-100)',
    borderRadius: 'var(--r-bubble-in)',
    maxWidth: '90%',
  },
  welcomeText: {
    fontSize: '0.9375rem',
    lineHeight: 1.6,
    color: 'var(--plum-900)',
    margin: 0,
  },

  /* Examples */
  exampleRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    paddingLeft: 4,
  },
  exampleChip: {
    padding: '8px 14px',
    fontSize: '0.875rem',
    background: '#fff',
    color: 'var(--plum-700)',
    border: '1px solid var(--plum-100)',
    borderRadius: 'var(--r-chip)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    minHeight: 40,
  },

  /* User bubble */
  userRow: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  userBubble: {
    padding: '12px 16px',
    background: 'var(--plum-700)',
    color: '#fff',
    borderRadius: 'var(--r-bubble-out)',
    fontSize: '0.9375rem',
    lineHeight: 1.55,
    maxWidth: '82%',
    wordBreak: 'break-word',
    whiteSpace: 'pre-wrap',
  },

  /* Preliminary signals */
  prelimBubble: {
    padding: '12px 16px',
    background: 'var(--warn-bg)',
    border: '1px solid #FDE68A',
    borderRadius: 'var(--r-bubble-in)',
    maxWidth: '90%',
  },
  prelimHeading: {
    fontSize: '0.9375rem',
    fontWeight: 700,
    color: 'var(--warn)',
    marginBottom: 6,
  },
  prelimList: {
    listStyle: 'none',
    margin: '0 0 6px',
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  prelimItem: {
    fontSize: '0.875rem',
    color: '#78350f',
    lineHeight: 1.4,
  },
  prelimPhrase: {
    fontStyle: 'italic',
  },
  prelimFooter: {
    fontSize: '0.8125rem',
    color: '#a16207',
    fontStyle: 'italic',
  },

  /* Typing bubble */
  typingBubble: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 14px',
    background: 'var(--plum-100)',
    borderRadius: 'var(--r-bubble-in)',
    maxWidth: '80%',
  },
  typingLabel: {
    fontSize: '0.875rem',
    color: '#888',
  },

  /* Download card */
  downloadCard: {
    padding: '16px 18px',
    background: 'var(--plum-100)',
    borderRadius: 'var(--r-bubble-in)',
    maxWidth: '90%',
  },
  downloadText: {
    fontSize: '0.9375rem',
    lineHeight: 1.55,
    color: 'var(--plum-900)',
    marginBottom: 14,
  },
  dlProgressRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  dlPct: {
    fontSize: '0.875rem',
    color: 'var(--plum-700)',
    fontWeight: 600,
    minWidth: 36,
    textAlign: 'right',
  },
  dlBtn: {
    padding: '10px 20px',
    fontSize: '0.9375rem',
    fontWeight: 700,
    background: 'var(--plum-700)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--r-btn)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    minHeight: 48,
  },

  /* Error bubble */
  errorBubble: {
    padding: '12px 16px',
    background: 'var(--scam-bg)',
    border: '1px solid #FECACA',
    borderRadius: 'var(--r-bubble-in)',
    fontSize: '0.9375rem',
    color: 'var(--scam)',
    maxWidth: '90%',
    lineHeight: 1.5,
  },

  /* Dev section */
  devSection: {
    marginTop: 48,
    paddingTop: 20,
    borderTop: '1px solid var(--line)',
  },
  devToggle: {
    background: 'none',
    border: 'none',
    color: '#aaa',
    fontSize: '0.875rem',
    cursor: 'pointer',
    padding: 0,
    fontFamily: 'inherit',
  },
  devContent: {
    marginTop: 8,
  },
  devRow: {
    display: 'flex',
    gap: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  devBtn: {
    padding: '6px 12px',
    fontSize: '0.8rem',
    background: '#f3f4f6',
    border: '1px solid var(--line)',
    borderRadius: 8,
    cursor: 'pointer',
    fontFamily: 'inherit',
    color: '#374151',
  },
};
