// VerdictCard — displays the structured result from checkMessage().
//
// Props:
//   result         — result object from checkMessage/onDeviceCheck/cloudCheck
//   originalText   — the original message text (used for inline highlighting)
//   onSecondOpinion — callback to request cloud second opinion (optional)
//
// Colour scheme:
//   scam       → red
//   suspicious → amber
//   safe       → green

import { REPORTING_TIPS, ADVICE_BY_CATEGORY } from '../config';
import HighlightedMessage from './HighlightedMessage';

const VERDICT_CONFIG = {
  scam: {
    label: 'SCAM',
    bg: '#fef2f2',
    border: '#fca5a5',
    headBg: '#dc2626',
    headText: '#fff',
    bodyText: '#7f1d1d',
  },
  suspicious: {
    label: 'SUSPICIOUS',
    bg: '#fffbeb',
    border: '#fcd34d',
    headBg: '#d97706',
    headText: '#fff',
    bodyText: '#78350f',
  },
  safe: {
    label: 'SAFE',
    bg: '#f0fdf4',
    border: '#86efac',
    headBg: '#16a34a',
    headText: '#fff',
    bodyText: '#14532d',
  },
};

const CATEGORY_LABELS = {
  fake_bank_alert:          'Fake Bank Alert',
  account_block_or_bvn_nin: 'Account / BVN / NIN Block',
  otp_pin_request:          'OTP / PIN Request',
  job_or_loan_upfront_fee:  'Job / Loan with Upfront Fee',
  prize_or_lottery:         'Prize / Lottery',
  impersonation:            'Impersonation',
  investment_scheme:        'Investment Scheme',
  wrong_transfer_refund:    'Wrong Transfer Refund',
  romance:                  'Romance Scam',
  phishing_link:            'Phishing Link',
  other:                    'Other',
};

const CONFIDENCE_LABELS = {
  high:   'High confidence',
  medium: 'Medium confidence',
  low:    'Low confidence',
};

function getCategoryLabel(verdict, category) {
  if (verdict === 'safe') return 'Legitimate message';
  if (category === 'none') return 'Other suspicious message';
  return CATEGORY_LABELS[category] ?? category;
}

export default function VerdictCard({ result, originalText, onSecondOpinion, onInvestigate }) {
  const cfg = VERDICT_CONFIG[result.verdict] ?? VERDICT_CONFIG.suspicious;
  const categoryLabel = getCategoryLabel(result.verdict, result.category);
  const confidenceLabel = CONFIDENCE_LABELS[result.confidence] ?? result.confidence;
  const isCloud = result.source === 'cloud';
  const isSafe = result.verdict === 'safe';

  // Advice from config — keyed by category, fallback to 'other'
  const advice = ADVICE_BY_CATEGORY[result.category] ?? ADVICE_BY_CATEGORY.other;

  // Highlights for HighlightedMessage: use flags that have valid start/end positions
  const highlights = (result.redFlags ?? []).filter((f) => f.start >= 0);

  return (
    <div style={{ ...styles.card, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
      {/* Header */}
      <div style={{ ...styles.header, background: cfg.headBg }}>
        <span style={{ ...styles.verdictLabel, color: cfg.headText }}>
          {cfg.label}
        </span>
        <span style={{ ...styles.category, color: cfg.headText }}>
          {categoryLabel}
        </span>
      </div>

      {/* Body */}
      <div style={{ ...styles.body, color: cfg.bodyText }}>
        {/* Explanation + confidence */}
        <p style={styles.summary}>{result.explanation}</p>
        <p style={styles.confidence}>{confidenceLabel}</p>

        {/* Highlighted original text — shows which phrases triggered the flags */}
        {originalText && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Message</div>
            <div style={{ ...styles.messageBox, borderColor: cfg.border }}>
              <HighlightedMessage text={originalText} highlights={highlights} />
            </div>
            {highlights.length > 0 && (
              <p style={styles.highlightHint}>
                Hover highlighted phrases to see why they were flagged.
              </p>
            )}
          </div>
        )}

        {/* Red flags — only shown for scam/suspicious */}
        {result.redFlags && result.redFlags.length > 0 && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Red flags</div>
            <ul style={styles.flagList}>
              {result.redFlags.map((flag, i) => (
                <li key={i} style={styles.flagItem}>
                  <span style={styles.flagPhrase}>
                    &ldquo;{flag.phrase}&rdquo;
                  </span>
                  {flag.reason && (
                    <span style={styles.flagReason}> — {flag.reason}</span>
                  )}
                  {flag.source && (
                    <span style={styles.flagSource}>
                      {' '}({flag.source === 'rule' ? 'rule' : 'AI'})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Per-category advice from config (replaces AI-generated advice) */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>{isSafe ? 'Note' : 'Advice'}</div>
          <p style={styles.advice}>{advice}</p>
        </div>

        {/* Static reporting tips — only for scam/suspicious */}
        {!isSafe && (
          <div style={{ ...styles.section, ...styles.reportingBox }}>
            <div style={{ ...styles.sectionTitle, color: cfg.bodyText }}>What you can do</div>
            <ul style={styles.reportingList}>
              {REPORTING_TIPS.map((tip, i) => (
                <li key={i} style={styles.reportingItem}>{tip}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Second opinion button — shown when needsSecondOpinion and callback provided */}
        {result.needsSecondOpinion && onSecondOpinion && (
          <div style={styles.secondOpinionRow}>
            <button
              style={styles.secondOpinionBtn}
              onClick={onSecondOpinion}
              type="button"
            >
              Not sure? Get a second opinion from the cloud
              <span style={styles.secondOpinionNote}> (personal details masked)</span>
            </button>
          </div>
        )}

        {/* Investigate deeper button — shown for all verdicts when callback provided */}
        {onInvestigate && (
          <div style={styles.investigateRow}>
            <button
              style={styles.investigateBtn}
              onClick={onInvestigate}
              type="button"
            >
              {isSafe ? 'Still unsure? Investigate deeper' : 'Investigate deeper'}
              <span style={styles.investigateNote}> — searches links & numbers online</span>
            </button>
          </div>
        )}

        {/* Footer: source + timing */}
        <div style={styles.footer}>
          <span style={{ ...styles.sourceBadge, ...(isCloud ? styles.sourceBadgeCloud : styles.sourceBadgeDevice) }}>
            {isCloud ? 'Cloud check (text was masked)' : 'Private (checked on-device)'}
          </span>
          {result.durationMs != null && (
            <span style={styles.timing}>{result.durationMs.toLocaleString()} ms</span>
          )}
        </div>

        {/* Show masked text preview for cloud checks */}
        {isCloud && result.maskedText && (
          <details style={styles.maskedDetails}>
            <summary style={styles.maskedSummary}>View what was sent to the cloud</summary>
            <pre style={styles.maskedText}>{result.maskedText}</pre>
          </details>
        )}
      </div>
    </div>
  );
}

const styles = {
  card: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 16px',
  },
  verdictLabel: {
    fontSize: '0.9rem',
    fontWeight: 700,
    letterSpacing: '0.08em',
  },
  category: {
    fontSize: '0.82rem',
    fontWeight: 500,
    opacity: 0.9,
  },
  body: {
    padding: '16px 16px 12px',
  },
  summary: {
    margin: '0 0 4px',
    fontSize: '0.95rem',
    fontWeight: 500,
    lineHeight: 1.5,
  },
  confidence: {
    margin: '0 0 16px',
    fontSize: '0.82rem',
    opacity: 0.75,
  },
  section: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: '0.8rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 6,
    opacity: 0.7,
  },
  messageBox: {
    padding: '10px 12px',
    background: 'rgba(0,0,0,0.03)',
    borderRadius: 6,
    border: '1px solid',
  },
  highlightHint: {
    margin: '4px 0 0',
    fontSize: '0.75rem',
    opacity: 0.6,
    fontStyle: 'italic',
  },
  flagList: {
    margin: 0,
    paddingLeft: 18,
  },
  flagItem: {
    fontSize: '0.875rem',
    lineHeight: 1.6,
    marginBottom: 4,
  },
  flagPhrase: {
    fontWeight: 600,
  },
  flagReason: {
    opacity: 0.85,
  },
  flagSource: {
    fontSize: '0.75rem',
    opacity: 0.55,
  },
  advice: {
    margin: 0,
    fontSize: '0.875rem',
    lineHeight: 1.6,
  },
  reportingBox: {
    background: 'rgba(0,0,0,0.04)',
    borderRadius: 7,
    padding: '10px 12px',
    marginBottom: 14,
  },
  reportingList: {
    margin: 0,
    paddingLeft: 18,
  },
  reportingItem: {
    fontSize: '0.82rem',
    lineHeight: 1.7,
    marginBottom: 2,
  },
  secondOpinionRow: {
    marginBottom: 10,
  },
  secondOpinionBtn: {
    padding: '7px 14px',
    fontSize: '0.82rem',
    fontWeight: 600,
    background: 'transparent',
    border: '1px solid currentColor',
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: 'inherit',
    opacity: 0.75,
  },
  secondOpinionNote: {
    fontWeight: 400,
    opacity: 0.8,
  },
  investigateRow: {
    marginBottom: 14,
  },
  investigateBtn: {
    padding: '7px 14px',
    fontSize: '0.82rem',
    fontWeight: 600,
    background: '#eff6ff',
    border: '1px solid #93c5fd',
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: 'inherit',
    color: '#1e40af',
  },
  investigateNote: {
    fontWeight: 400,
    opacity: 0.75,
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 16,
    paddingTop: 12,
    borderTop: '1px solid rgba(0,0,0,0.08)',
    flexWrap: 'wrap',
  },
  sourceBadge: {
    fontSize: '0.78rem',
    fontWeight: 600,
    padding: '3px 10px',
    borderRadius: 99,
  },
  sourceBadgeDevice: {
    background: '#dcfce7',
    color: '#166534',
  },
  sourceBadgeCloud: {
    background: '#dbeafe',
    color: '#1e40af',
  },
  timing: {
    fontSize: '0.78rem',
    opacity: 0.6,
  },
  maskedDetails: {
    marginTop: 10,
  },
  maskedSummary: {
    fontSize: '0.8rem',
    cursor: 'pointer',
    opacity: 0.7,
  },
  maskedText: {
    marginTop: 6,
    padding: '10px 12px',
    background: 'rgba(0,0,0,0.06)',
    borderRadius: 6,
    fontSize: '0.8rem',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontFamily: 'var(--mono, monospace)',
  },
};
