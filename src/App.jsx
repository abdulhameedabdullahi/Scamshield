import { useState, useEffect, useCallback, useRef } from 'react';
import { getOnDeviceAvailability } from './ai/availability';
import {
  checkMessage, downloadAndCheck, cloudCheck,
  preloadDeviceModel, warmUpDeviceModel, ocrImage, ocrImageCloud,
} from './ai/checkMessage';
import { analyzeSignals } from './ai/rules';
import { detectEntities } from './ai/maskMessage';
import { queryReports, saveReport } from './services/reports';
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
import { isOverDailyLimit, incrementDailyCount } from './services/dailyQuota';
import { APP_URL } from './config';
// Category labels used for the share warning message
const CATEGORY_LABELS = {
  fake_bank_alert:          'fake bank alert',
  account_block_or_bvn_nin: 'BVN/NIN account block scam',
  otp_pin_request:          'OTP/PIN theft attempt',
  job_or_loan_upfront_fee:  'fake job or loan scam',
  prize_or_lottery:         'fake prize or lottery',
  impersonation:            'impersonation scam',
  investment_scheme:        'investment scheme scam',
  wrong_transfer_refund:    'wrong transfer refund scam',
  romance:                  'romance scam',
  phishing_link:            'phishing link',
  other:                    'suspicious scam message',
};

// ── Preliminary verdict (Stage A: rule engine, synchronous) ───────────────
// Returns a VerdictCard-compatible result object when the rule engine has
// enough signal to show an instant card, or null to fall through to PrelimBubble.

function buildPreliminaryVerdict(signals, ruleScore) {
  const hasStrongSafe = signals.some((s) => s.id === 'do_not_share' || s.id === 'standard_alert');
  const positiveSignals = signals.filter((s) => s.weight > 0);

  // Strong safe signal with no risk → safe preliminary
  if (hasStrongSafe && positiveSignals.length === 0) {
    return {
      verdict: 'safe', confidence: 'low', category: 'none', redFlags: [],
      explanation: 'Rule engine found strong safe signals.',
      isPreliminary: true, source: 'rules', signals,
    };
  }

  // High rule score → suspicious or scam preliminary
  if (ruleScore >= 6) {
    const ruleFlags = positiveSignals
      .filter((s) => s.start >= 0 && s.phrase)
      .slice(0, 3)
      .map((s) => ({ phrase: s.phrase, reason: s.label, source: 'rule', start: s.start, end: s.end }));
    return {
      verdict: ruleScore >= 10 ? 'scam' : 'suspicious',
      confidence: 'low',
      category: 'other',
      redFlags: ruleFlags,
      explanation: 'Rule engine detected strong risk signals.',
      isPreliminary: true,
      source: 'rules',
      signals,
      needsSecondOpinion: false,
    };
  }

  return null;
}

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
    text: 'ALERT: Your Halden Bank account has been debited N150,000. If you did not authorise this, click here to reverse: http://halden-verify.com/secure',
  },
  {
    label: 'Job offer',
    text: 'Congratulations! You have been selected for a remote data-entry job. Salary: N80,000/month. Pay N5,000 registration fee to get started. Reply YES.',
  },
  {
    label: 'BVN threat',
    text: 'NRA NOTICE: Your BVN has been flagged for suspicious activity. Update your BVN immediately at www.nra-bvn-update.net or your accounts will be frozen within 24 hours.',
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
  // Lazy initializer reads Web Share Target params (?text=, ?url=, ?title=) on first render.
  const [text, setText]                     = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const shared = [params.get('text'), params.get('url'), params.get('title')]
      .filter(Boolean).join(' ').trim();
    if (shared) {
      window.history.replaceState({}, '', window.location.pathname + window.location.hash);
      return shared;
    }
    return '';
  });
  const [result, setResult]                 = useState(null);
  const [errorMsg, setErrorMsg]             = useState('');
  const [availability, setAvailability]     = useState(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [devOpen, setDevOpen]               = useState(false);
  const [maskData, setMaskData]             = useState(null);

  // Image OCR state
  const [imageData, setImageData]           = useState(null); // { base64, mimeType, preview }
  const [ocrState, setOcrState]             = useState('idle'); // 'idle' | 'reading'

  // Community report state
  const [communityData, setCommunityData]   = useState(null);
  const [communityQueried, setCommunityQueried] = useState(null); // { kind: 'phone'|'domain' } | null
  const [reportState, setReportState]       = useState('idle'); // 'idle' | 'saving' | 'done'

  // Agent state
  const [investigateState, setInvestigateState]     = useState('idle');
  const [investigateMaskData, setInvestigateMaskData] = useState(null);
  const [investigateMaskedText, setInvestigateMaskedText] = useState(null);
  const [investigateVerdict, setInvestigateVerdict] = useState(null);

  // Instant rule preview
  const [preliminarySignals, setPreliminarySignals] = useState(null);
  // Stage A preliminary verdict card (shown while AI is still running)
  const [prelimResult, setPrelimResult] = useState(null);
  // OCR consent: set when on-device OCR unavailable, cleared by confirm/cancel
  const [ocrConsentData, setOcrConsentData] = useState(null);
  // Agent quota error
  const [investigateError, setInvestigateError] = useState(null);
  // Offline detection
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // Scroll
  const bottomRef = useRef(null);

  useEffect(() => {
    const setOnline  = () => setIsOffline(false);
    const setOffline = () => setIsOffline(true);
    window.addEventListener('online',  setOnline);
    window.addEventListener('offline', setOffline);
    return () => {
      window.removeEventListener('online',  setOnline);
      window.removeEventListener('offline', setOffline);
    };
  }, []);

  useEffect(() => {
    getOnDeviceAvailability().then(setAvailability);
  }, []);

  useEffect(() => {
    if (availability === 'available') warmUpDeviceModel();
  }, [availability]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [appState, investigateState, result]);

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
    setPrelimResult(null);
    setOcrConsentData(null);
    setInvestigateError(null);
    setCommunityData(null); setCommunityQueried(null); setReportState('idle');
  }

  function handleClear() {
    setText(''); setAppState('idle'); setResult(null); setErrorMsg('');
    setMaskData(null); setInvestigateState('idle'); setInvestigateMaskData(null);
    setInvestigateMaskedText(null); setInvestigateVerdict(null);
    setPreliminarySignals(null); setPrelimResult(null);
    setImageData(null); setOcrState('idle'); setOcrConsentData(null);
    setInvestigateError(null);
    setCommunityData(null); setCommunityQueried(null); setReportState('idle');
  }

  // ── Image handling ──────────────────────────────────────────────────────

  function handleImageFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result.split(',')[1];
      const mimeType = file.type || 'image/png';
      setImageData({ base64, mimeType, preview: e.target.result });
      setCommunityData(null); setCommunityQueried(null); setReportState('idle');
    };
    reader.readAsDataURL(file);
  }

  async function handleImageCheck() {
    if (!imageData) return;
    setOcrState('reading');
    setAppState('checking'); setResult(null); setErrorMsg('');
    setInvestigateState('idle'); setInvestigateMaskData(null);
    setInvestigateMaskedText(null); setInvestigateVerdict(null);
    setPreliminarySignals(null); setPrelimResult(null);
    setInvestigateError(null);
    setCommunityData(null); setCommunityQueried(null); setReportState('idle');
    try {
      const ocrResult = await ocrImage(imageData);
      if (ocrResult.needsCloudConsent) {
        setOcrState('needs_cloud_consent');
        setOcrConsentData({ imageData });
        setAppState('idle');
        return;
      }
      const extracted = ocrResult.text;
      setText(extracted);
      setOcrState('idle');
      await _runCheckOnExtracted(extracted);
    } catch (err) {
      setOcrState('idle');
      setErrorMsg(err?.message ?? 'Could not read the image. Please try again.');
      setAppState('error');
    }
  }

  async function handleOcrCloudConfirm() {
    if (!ocrConsentData) return;
    if (isOverDailyLimit()) {
      setOcrConsentData(null);
      setErrorMsg('You\'ve reached the daily limit of 15 online checks. Try again tomorrow.');
      setAppState('error');
      return;
    }
    const { imageData: imgData } = ocrConsentData;
    setOcrConsentData(null);
    setOcrState('reading_cloud');
    setAppState('checking'); setResult(null); setErrorMsg('');
    try {
      const { text: extracted } = await ocrImageCloud(imgData);
      incrementDailyCount();
      setText(extracted);
      setOcrState('idle');
      await _runCheckOnExtracted(extracted);
    } catch (err) {
      setOcrState('idle');
      setErrorMsg(err?.message ?? 'Could not read the image. Please try again.');
      setAppState('error');
    }
  }

  function handleOcrCloudCancel() {
    setOcrConsentData(null);
    setOcrState('idle');
    setAppState('idle');
  }

  async function _runCheckOnExtracted(extracted) {
    const { signals, ruleScore } = analyzeSignals(extracted);
    setPreliminarySignals({ signals, ruleScore });
    const prelim = buildPreliminaryVerdict(signals, ruleScore);
    setPrelimResult(prelim);
    if (prelim) console.log(`[ScamShield] Stage A (rule engine, ~0ms): ${prelim.verdict}`);
    const stageATime = Date.now();
    setAppState('checking');
    try {
      const outcome = await checkMessage(extracted, () => {});
      console.log(`[ScamShield] Stage B (AI): ${Date.now() - stageATime}ms → ${outcome.state ?? outcome.verdict}`);
      if (outcome.state === 'needs_download') {
        setAvailability(outcome.availability); setAppState('needs_download');
      } else if (outcome.state === 'needs_consent') {
        setAvailability(outcome.availability); setAppState('masking');
        try {
          const md = await detectEntities(extracted);
          setMaskData(md); setAppState('send_preview');
        } catch (err) {
          setErrorMsg(err?.message ?? 'Couldn\'t prepare message. Please try again.');
          setAppState('error');
        }
      } else {
        setPrelimResult(null);
        setResult(outcome);
        if (outcome.source === 'on-device') setAvailability('available');
        setAppState('done');
        fetchCommunityData(outcome);
      }
    } catch (err) {
      setErrorMsg(err?.message ?? 'Something went wrong. Please try again.');
      setAppState('error');
    }
  }

  // ── Community lookup (runs silently after check completes) ──────────────

  async function fetchCommunityData(outcome) {
    if (!navigator.onLine) return;
    try {
      const signals = outcome.signals ?? [];
      const phoneSig = signals.find((s) => s.id === 'phone_number' && s.phrase);
      const urlSig   = signals.find((s) => s.id === 'link' && s.phrase);
      if (!phoneSig && !urlSig) return;

      const indicator = phoneSig?.phrase ?? urlSig?.phrase;
      const kind      = phoneSig ? 'phone' : 'domain';
      setCommunityQueried({ kind });
      const data = await queryReports(indicator, kind);
      if (data.count > 0) {
        setCommunityData({ ...data, indicatorKind: kind, indicator });
      }
    } catch { /* non-fatal */ }
  }

  // ── Report a confirmed scam ─────────────────────────────────────────────

  async function handleReport() {
    if (!result || reportState !== 'idle') return;
    setReportState('saving');
    try {
      const signals    = result.signals ?? [];
      const phoneSig   = signals.find((s) => s.id === 'phone_number' && s.phrase);
      const urlSig     = signals.find((s) => s.id === 'link' && s.phrase);
      const indicator  = phoneSig?.phrase ?? urlSig?.phrase ?? null;
      const indicatorKind = phoneSig ? 'phone' : urlSig ? 'domain' : null;

      await saveReport({
        verdict:      result.verdict,
        category:     result.category,
        indicator,
        indicatorKind,
      });
      setReportState('done');
    } catch (err) {
      console.error('[ScamShield] Report failed:', err?.message);
      setReportState('idle');
    }
  }

  // ── Share warning to contacts ───────────────────────────────────────────

  async function handleShare() {
    if (!result) return;
    const catLabel = CATEGORY_LABELS[result.category] ?? 'suspicious message';
    // Scammer identifier is sourced from result.signals only — never from raw message text.
    const signals = result.signals ?? [];
    const phoneSig = signals.find((s) => s.id === 'phone_number' && s.phrase);
    const urlSig   = signals.find((s) => s.id === 'link' && s.phrase);
    const indicator = phoneSig?.phrase ?? urlSig?.phrase ?? null;
    const indicatorNote = indicator ? ` (${indicator})` : '';
    const shareText =
      `⚠️ ScamShield Warning: I checked a message and it was flagged as a ${catLabel}${indicatorNote}.\n\n` +
      `Stay safe — don't reply, click links, or send money if you receive it.\n\n` +
      `🛡️ Check any message free at: ${APP_URL}`;

    if (navigator.share) {
      try { await navigator.share({ text: shareText }); } catch { /* user cancelled */ }
    } else {
      try {
        await navigator.clipboard.writeText(shareText);
        alert('Warning message copied to clipboard — paste it into WhatsApp to warn your contacts.');
      } catch { /* clipboard not available */ }
    }
  }

  async function handleCheck() {
    // If an image is loaded and no text, run image check instead
    if (imageData && !text.trim()) return handleImageCheck();
    if (!text.trim()) return;
    const trimmed = text.trim();
    setResult(null); setErrorMsg(''); setMaskData(null);
    setInvestigateState('idle'); setInvestigateMaskData(null);
    setInvestigateMaskedText(null); setInvestigateVerdict(null);
    setInvestigateError(null);
    setCommunityData(null); setCommunityQueried(null); setReportState('idle');

    // Stage A: synchronous rule engine — build preliminary verdict instantly
    const { signals, ruleScore } = analyzeSignals(trimmed);
    setPreliminarySignals({ signals, ruleScore });
    const prelim = buildPreliminaryVerdict(signals, ruleScore);
    setPrelimResult(prelim);
    if (prelim) console.log(`[ScamShield] Stage A (rule engine, ~0ms): ${prelim.verdict}`);
    const stageATime = Date.now();

    setAppState('checking');
    try {
      const outcome = await checkMessage(trimmed, () => {});
      console.log(`[ScamShield] Stage B (AI): ${Date.now() - stageATime}ms → ${outcome.state ?? outcome.verdict}`);
      if (outcome.state === 'needs_download') {
        setAvailability(outcome.availability); setAppState('needs_download');
      } else if (outcome.state === 'needs_consent') {
        setAvailability(outcome.availability); setAppState('masking');
        try {
          const md = await detectEntities(trimmed);
          setMaskData(md); setAppState('send_preview');
        } catch (err) {
          setErrorMsg(err?.message ?? 'Couldn\'t prepare message. Please try again.');
          setAppState('error');
        }
      } else {
        setPrelimResult(null);
        setResult(outcome);
        if (outcome.source === 'on-device') setAvailability('available');
        setAppState('done');
        fetchCommunityData(outcome);
      }
    } catch (err) {
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
    if (isOverDailyLimit()) {
      setErrorMsg('You\'ve reached the daily limit of 15 online checks. Try again tomorrow, or use the on-device check if available.');
      setAppState('error');
      return;
    }
    setAppState('checking'); setMaskData(null); setResult(null); setErrorMsg('');
    try {
      const outcome = await cloudCheck(text, () => {}, maskedText);
      incrementDailyCount();
      setResult(outcome); setAppState('done');
      fetchCommunityData(outcome);
    } catch (err) {
      setErrorMsg(err?.message ?? 'Couldn\'t check online. Check your internet and try again.');
      setAppState('error');
    }
  }

  function handleCloudSendCancel() { setAppState('idle'); setMaskData(null); }

  async function handleInvestigateRequest(verdictResult) {
    if (isOverDailyLimit()) {
      setInvestigateError('You\'ve reached the daily limit of 15 online checks. Try again tomorrow.');
      return;
    }
    setInvestigateError(null);
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
    incrementDailyCount();
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
  const isDev = import.meta.env.DEV;
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
          <button className="topbar-new-check" onClick={handleClear} type="button">
            New check
          </button>
        )}

        <button
          className="topbar-icon-btn"
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

          {/* Offline notice */}
          {isOffline && (
            <div style={S.offlineBanner} role="status" aria-live="polite">
              You're offline — checking still works on this phone. Online features are unavailable.
            </div>
          )}

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
                        className="chip-example"
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
                <div style={S.userRow} className="user-bubble-enter" aria-label="Your message">
                  <div style={S.userBubble}>{text}</div>
                </div>
              )}

              {/* ── OCR cloud consent ── */}
              {ocrState === 'needs_cloud_consent' && (
                <OcrConsentBubble
                  onConfirm={handleOcrCloudConfirm}
                  onCancel={handleOcrCloudCancel}
                  isOffline={isOffline}
                />
              )}

              {/* ── Preliminary signals while checking (no strong rule verdict) ── */}
              {uniqueSignals.length > 0 && appState === 'checking' && !prelimResult && (
                <PrelimBubble signals={uniqueSignals} />
              )}

              {/* ── Stage A: preliminary VerdictCard (rule engine instant result) ── */}
              {appState === 'checking' && prelimResult && (
                <VerdictCard result={prelimResult} originalText={text} />
              )}

              {/* ── Typing indicator ── */}
              {ocrState === 'reading' && (
                <TypingBubble label="Reading text from your screenshot on this phone…" />
              )}
              {ocrState === 'reading_cloud' && (
                <TypingBubble label="Uploading screenshot to read its text…" />
              )}
              {appState === 'checking' && ocrState !== 'reading' && ocrState !== 'reading_cloud' && (
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
                <div style={S.errorBubble} className="bubble-enter" role="alert" aria-live="assertive">
                  <strong>Couldn't check the message.</strong> {errorMsg}
                </div>
              )}

              {/* ── Result ── */}
              {appState === 'done' && result && (
                <VerdictCard
                  result={result}
                  originalText={text}
                  communityData={communityData}
                  communityQueried={communityQueried}
                  isOffline={isOffline}
                  onInvestigate={
                    investigateState === 'idle'
                      ? () => handleInvestigateRequest(result)
                      : undefined
                  }
                  onShare={handleShare}
                  onReport={reportState === 'idle' ? handleReport : undefined}
                />
              )}
              {appState === 'done' && reportState === 'done' && (
                <div style={S.reportedBadge} className="bubble-enter" role="status">
                  ✓ Reported — thank you for helping protect the community.
                </div>
              )}

              {/* ── Agent quota / investigate error ── */}
              {investigateError && (
                <div style={S.errorBubble} className="bubble-enter" role="alert">
                  {investigateError}
                </div>
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
                disabled={isChecking || isDownloading || ocrState === 'reading'}
                onImageFile={handleImageFile}
                imagePreview={imageData?.preview ?? null}
                onClearImage={() => { setImageData(null); setOcrState('idle'); }}
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
    <div style={S.welcomeBubble} className="bubble-enter" role="status">
      <p style={S.welcomeText}>
        Hi! Paste any message you're unsure about — a WhatsApp message, SMS or email.
        I'll check it on your phone first. Personal details are hidden before anything goes online.
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
    <div style={S.prelimBubble} className="bubble-enter" role="status" aria-live="polite">
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

function OcrConsentBubble({ onConfirm, onCancel, isOffline }) {
  return (
    <div style={S.ocrConsentBubble} className="bubble-enter" role="dialog" aria-label="Upload screenshot for text reading">
      <strong style={S.ocrConsentTitle}>Reading this screenshot needs to go online.</strong>
      <p style={S.ocrConsentBody}>
        This device can't read images privately. If you continue, the image will be sent to
        Google's Gemini service to read the text. Screenshots can show names, numbers or
        balances, so crop out anything private first.
      </p>
      <div style={S.ocrConsentActions}>
        <button className="btn-deeper" onClick={isOffline ? undefined : onConfirm} disabled={isOffline} type="button">
          Upload and read
        </button>
        <button className="btn-ghost" onClick={onCancel} type="button">
          Cancel
        </button>
      </div>
      {isOffline && (
        <p style={{ ...S.ocrConsentBody, color: '#888', fontStyle: 'italic' }}>
          You're offline — upload unavailable.
        </p>
      )}
    </div>
  );
}

function TypingBubble({ label }) {
  return (
    <div style={S.typingBubble} className="bubble-enter" aria-live="polite" aria-label={label}>
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
    <div style={S.downloadCard} className="bubble-enter" role="region" aria-label="Download private checker">
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
        <button className="btn-deeper" onClick={onDownload} type="button">
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
      className={`menu-nav-link${active ? ' active' : ''}`}
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
  menuDivider: {
    height: 1,
    background: 'var(--line)',
    margin: '8px 20px',
  },

  /* Offline banner */
  offlineBanner: {
    margin: '0 16px 8px',
    padding: '8px 14px',
    background: '#FFF9C4',
    border: '1px solid #FDE68A',
    borderRadius: 10,
    fontSize: '0.875rem',
    color: '#78350f',
    lineHeight: 1.4,
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

  /* OCR consent */
  ocrConsentBubble: {
    padding: '16px 18px',
    background: 'var(--plum-100)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--r-bubble-in)',
    maxWidth: '90%',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  ocrConsentTitle: {
    fontSize: '0.9375rem',
    color: 'var(--plum-900)',
  },
  ocrConsentBody: {
    fontSize: '0.9rem',
    color: '#555',
    lineHeight: 1.5,
    margin: 0,
  },
  ocrConsentActions: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
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

  /* Reported badge */
  reportedBadge: {
    padding: '10px 14px',
    background: 'var(--safe-bg)',
    border: '1px solid #A7F3D0',
    borderRadius: 'var(--r-bubble-in)',
    fontSize: '0.9375rem',
    color: 'var(--safe)',
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
