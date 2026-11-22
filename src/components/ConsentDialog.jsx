// ConsentDialog — shown when on-device AI is unavailable and the user has not
// yet decided whether to allow a cloud check.
//
// Privacy note: before anything is sent to the cloud, regexMask() replaces
// phone numbers, email addresses, account numbers, BVN/NIN, and card numbers
// with generic placeholders (e.g. [PHONE], [ACCOUNT]).  The dialog explains
// this so the user can make an informed choice.

export default function ConsentDialog({ onConsent, onDecline }) {
  return (
    <div style={styles.wrap}>
      <div style={styles.iconRow}>
        <span style={styles.lockIcon}>&#128274;</span>
      </div>

      <h3 style={styles.title}>Private AI not available on this device</h3>
      <p style={styles.body}>
        Gemini Nano (the private, on-device AI) is not supported here. To check this
        message, ScamShield would need to send it to Google&apos;s AI service in the
        cloud.
      </p>

      <div style={styles.maskBox}>
        <div style={styles.maskTitle}>What happens before sending</div>
        <p style={styles.maskBody}>
          Your message is automatically processed to replace personal details with
          placeholders before anything leaves your device:
        </p>
        <ul style={styles.maskList}>
          <li>Phone numbers → <code style={styles.code}>[PHONE]</code></li>
          <li>Email addresses → <code style={styles.code}>[EMAIL]</code></li>
          <li>Bank account numbers → <code style={styles.code}>[ACCOUNT]</code></li>
          <li>BVN / NIN → <code style={styles.code}>[ID_NUMBER]</code></li>
          <li>Card numbers → <code style={styles.code}>[CARD]</code></li>
        </ul>
        <p style={styles.maskNote}>
          The check still works on the masked text because scam patterns do not
          depend on specific numbers.
        </p>
      </div>

      <div style={styles.buttons}>
        <button style={styles.declineBtn} onClick={onDecline} type="button">
          No thanks
        </button>
        <button style={styles.consentBtn} onClick={onConsent} type="button">
          Check via cloud (mask first)
        </button>
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    background: '#fffbeb',
    border: '1px solid #fcd34d',
    borderRadius: 10,
    padding: '20px 20px 16px',
    marginBottom: 16,
  },
  iconRow: {
    marginBottom: 10,
    fontSize: '1.4rem',
  },
  lockIcon: {},
  title: {
    margin: '0 0 8px',
    fontSize: '0.95rem',
    fontWeight: 700,
    color: '#92400e',
  },
  body: {
    margin: '0 0 14px',
    fontSize: '0.875rem',
    lineHeight: 1.6,
    color: '#78350f',
  },
  maskBox: {
    background: 'rgba(0,0,0,0.04)',
    borderRadius: 7,
    padding: '12px 14px',
    marginBottom: 16,
  },
  maskTitle: {
    fontWeight: 700,
    fontSize: '0.8rem',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: '#92400e',
    marginBottom: 6,
  },
  maskBody: {
    margin: '0 0 8px',
    fontSize: '0.82rem',
    lineHeight: 1.5,
    color: '#78350f',
  },
  maskList: {
    margin: '0 0 8px',
    paddingLeft: 18,
    fontSize: '0.82rem',
    lineHeight: 1.8,
    color: '#78350f',
  },
  maskNote: {
    margin: 0,
    fontSize: '0.8rem',
    color: '#92400e',
    fontStyle: 'italic',
  },
  code: {
    fontFamily: 'var(--mono, monospace)',
    background: 'rgba(0,0,0,0.08)',
    padding: '1px 5px',
    borderRadius: 3,
    fontSize: '0.82rem',
  },
  buttons: {
    display: 'flex',
    gap: 10,
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  },
  declineBtn: {
    padding: '8px 18px',
    fontSize: '0.875rem',
    background: 'transparent',
    color: '#6b7280',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  consentBtn: {
    padding: '8px 18px',
    fontSize: '0.875rem',
    fontWeight: 600,
    background: '#d97706',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
};
