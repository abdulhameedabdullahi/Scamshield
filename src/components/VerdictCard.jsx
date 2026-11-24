// VerdictCard — hero verdict bubble from ScamShield.
// Styled as a chat bubble with big plain-language verdict + checklist.
//
// Props:
//   result        — from checkMessage/onDeviceCheck/cloudCheck
//   originalText  — raw message (for inline highlights)
//   onInvestigate — callback for "Dig deeper online" button (optional)

import { REPORTING_TIPS, ADVICE_BY_CATEGORY } from '../config';
import HighlightedMessage from './HighlightedMessage';

const VERDICT_CFG = {
  scam: {
    icon:     '🚨',
    headline: 'This is a scam.',
    bg:       'var(--scam-bg)',
    border:   '#FECACA',
    color:    'var(--scam)',
    bodyColor: '#7f1d1d',
  },
  suspicious: {
    icon:     '⚠️',
    headline: 'Be careful. This looks suspicious.',
    bg:       'var(--warn-bg)',
    border:   '#FDE68A',
    color:    'var(--warn)',
    bodyColor: '#78350f',
  },
  safe: {
    icon:     '✅',
    headline: 'This message looks safe.',
    bg:       'var(--safe-bg)',
    border:   '#A7F3D0',
    color:    'var(--safe)',
    bodyColor: '#14532d',
  },
};

const CATEGORY_LABELS = {
  fake_bank_alert:          'Fake bank alert',
  account_block_or_bvn_nin: 'Account / BVN / NIN block',
  otp_pin_request:          'OTP / PIN request',
  job_or_loan_upfront_fee:  'Job / loan with upfront fee',
  prize_or_lottery:         'Prize / lottery',
  impersonation:            'Impersonation',
  investment_scheme:        'Investment scheme',
  wrong_transfer_refund:    'Wrong transfer refund',
  romance:                  'Romance scam',
  phishing_link:            'Phishing link',
  other:                    'Other suspicious message',
};

export default function VerdictCard({ result, originalText, onInvestigate }) {
  const cfg = VERDICT_CFG[result.verdict] ?? VERDICT_CFG.suspicious;
  const isSafe = result.verdict === 'safe';
  const isCloud = result.source === 'cloud';
  const categoryLabel = isSafe
    ? null
    : (CATEGORY_LABELS[result.category] ?? null);

  const advice = ADVICE_BY_CATEGORY[result.category] ?? ADVICE_BY_CATEGORY.other;
  const highlights = (result.redFlags ?? []).filter((f) => f.start >= 0);

  // Checklist items: advice first, then static reporting tips (max 3)
  const checklistItems = isSafe
    ? [advice]
    : [advice, ...REPORTING_TIPS.slice(0, 3)];

  return (
    <div
      className="verdict-enter"
      style={{ ...S.bubble, background: cfg.bg, border: `1px solid ${cfg.border}` }}
      role="region"
      aria-label={`Verdict: ${cfg.headline}`}
      aria-live="polite"
    >
      {/* Verdict headline */}
      <div style={S.headRow}>
        <span style={S.icon} aria-hidden="true">{cfg.icon}</span>
        <div>
          <h2 style={{ ...S.headline, color: cfg.color }}>{cfg.headline}</h2>
          {categoryLabel && (
            <div style={{ ...S.category, color: cfg.bodyColor }}>{categoryLabel}</div>
          )}
        </div>
      </div>

      {/* One-line reason */}
      {result.explanation && (
        <p style={{ ...S.explanation, color: cfg.bodyColor }}>{result.explanation}</p>
      )}

      {/* Original message with highlights */}
      {originalText && (
        <div style={S.section}>
          <div style={S.sectionLabel}>The message you received</div>
          <div style={{ ...S.msgBox, borderColor: cfg.border }}>
            <HighlightedMessage text={originalText} highlights={highlights} />
          </div>
          {highlights.length > 0 && (
            <p style={S.tapHint}>Tap highlighted phrases to see why they were flagged.</p>
          )}
        </div>
      )}

      {/* What to do now */}
      <div style={S.section}>
        <div style={S.sectionLabel}>What to do now</div>
        <ul style={S.checklist} aria-label="Action checklist">
          {checklistItems.map((item, i) => (
            <li key={i} style={S.checkItem}>
              <span style={S.checkMark} aria-hidden="true">☑</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Dig deeper button */}
      {onInvestigate && (
        <button
          style={S.deeperBtn}
          onClick={onInvestigate}
          type="button"
        >
          Dig deeper online
        </button>
      )}

      {/* Privacy / source badge */}
      <div style={S.sourceLine}>
        {isCloud
          ? '☁️ Checked online. Personal details were hidden before sending.'
          : '🔒 Checked on this phone. Nothing was uploaded.'}
        {result.durationMs != null && (
          <span style={S.timing}> · {(result.durationMs / 1000).toFixed(1)}s</span>
        )}
      </div>

      {/* Masked text for cloud results */}
      {isCloud && result.maskedText && (
        <details style={S.maskedDetails}>
          <summary style={S.maskedSummary}>View what was sent online</summary>
          <pre style={S.maskedPre}>{result.maskedText}</pre>
        </details>
      )}
    </div>
  );
}

const S = {
  bubble: {
    borderRadius: 'var(--r-bubble-in)',
    padding: '18px 20px 16px',
    maxWidth: '92%',
  },
  headRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 10,
  },
  icon: {
    fontSize: '1.75rem',
    lineHeight: 1,
    flexShrink: 0,
    marginTop: 2,
  },
  headline: {
    fontSize: '1.25rem',
    fontFamily: 'var(--font-heading)',
    fontWeight: 600,
    lineHeight: 1.3,
    margin: 0,
  },
  category: {
    fontSize: '0.875rem',
    marginTop: 3,
    fontWeight: 500,
  },
  explanation: {
    fontSize: '0.9375rem',
    lineHeight: 1.55,
    marginBottom: 16,
  },
  section: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: '0.8125rem',
    fontWeight: 700,
    color: '#666',
    marginBottom: 6,
    textTransform: 'none',
  },
  msgBox: {
    padding: '10px 12px',
    background: 'rgba(255,255,255,0.65)',
    borderRadius: 10,
    border: '1px solid',
    fontSize: '0.9375rem',
    lineHeight: 1.6,
  },
  tapHint: {
    fontSize: '0.8125rem',
    color: '#888',
    marginTop: 4,
    fontStyle: 'italic',
  },
  checklist: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  checkItem: {
    display: 'flex',
    gap: 10,
    alignItems: 'flex-start',
    fontSize: '0.9375rem',
    lineHeight: 1.5,
  },
  checkMark: {
    flexShrink: 0,
    marginTop: 1,
    fontSize: '1rem',
  },
  deeperBtn: {
    display: 'block',
    width: '100%',
    padding: '12px 16px',
    marginBottom: 14,
    fontSize: '0.9375rem',
    fontWeight: 700,
    background: 'var(--plum-700)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--r-btn)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'center',
    minHeight: 48,
  },
  sourceLine: {
    fontSize: '0.8125rem',
    color: '#666',
    lineHeight: 1.4,
    marginTop: 4,
  },
  timing: {
    opacity: 0.7,
  },
  maskedDetails: {
    marginTop: 10,
  },
  maskedSummary: {
    fontSize: '0.8125rem',
    cursor: 'pointer',
    color: '#888',
  },
  maskedPre: {
    margin: '6px 0 0',
    padding: '10px 12px',
    background: 'rgba(255,255,255,0.65)',
    borderRadius: 8,
    fontSize: '0.8125rem',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontFamily: 'var(--font-mono)',
  },
};
