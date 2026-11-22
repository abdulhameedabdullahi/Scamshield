// MessageInput — textarea for the message to be checked, with Check / Clear buttons.

const MAX_CHARS = 2000;

export default function MessageInput({ value, onChange, onCheck, onClear, disabled }) {
  const count = value.length;
  const overLimit = count > MAX_CHARS;
  const canCheck = count > 0 && !overLimit && !disabled;

  return (
    <div style={styles.wrap}>
      <label style={styles.label} htmlFor="message-input">
        Paste the message you want to check
      </label>
      <textarea
        id="message-input"
        style={{ ...styles.textarea, ...(overLimit ? styles.textareaOver : {}) }}
        placeholder="e.g. &quot;Dear Customer, your account has been restricted. Click here to verify your BVN...&quot;"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        disabled={disabled}
        spellCheck={false}
        aria-label="Message to check"
      />
      <div style={styles.footer}>
        <span style={{ ...styles.counter, ...(overLimit ? styles.counterOver : {}) }}>
          {count.toLocaleString()} / {MAX_CHARS.toLocaleString()} characters
        </span>
        <div style={styles.buttons}>
          {value.length > 0 && (
            <button
              style={styles.clearBtn}
              onClick={onClear}
              disabled={disabled}
              type="button"
              aria-label="Clear message"
            >
              Clear
            </button>
          )}
          <button
            style={{ ...styles.checkBtn, ...(!canCheck ? styles.checkBtnDisabled : {}) }}
            onClick={onCheck}
            disabled={!canCheck}
            type="button"
          >
            {disabled ? 'Checking…' : 'Check this message'}
          </button>
        </div>
      </div>
      {overLimit && (
        <p style={styles.overLimitMsg}>
          Message is too long. Please shorten it to {MAX_CHARS.toLocaleString()} characters or fewer.
        </p>
      )}
    </div>
  );
}

const styles = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  label: {
    fontSize: '0.9rem',
    fontWeight: 500,
    color: '#374151',
  },
  textarea: {
    width: '100%',
    padding: '12px 14px',
    fontSize: '0.9rem',
    fontFamily: 'inherit',
    lineHeight: 1.6,
    border: '1px solid #d1d5db',
    borderRadius: 8,
    resize: 'vertical',
    color: '#374151',
    background: '#fff',
    boxSizing: 'border-box',
    outline: 'none',
  },
  textareaOver: {
    borderColor: '#fca5a5',
    background: '#fff5f5',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  counter: {
    fontSize: '0.8rem',
    color: '#9ca3af',
  },
  counterOver: {
    color: '#dc2626',
    fontWeight: 600,
  },
  buttons: {
    display: 'flex',
    gap: 8,
  },
  clearBtn: {
    padding: '8px 16px',
    fontSize: '0.875rem',
    background: 'transparent',
    color: '#6b7280',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  checkBtn: {
    padding: '8px 20px',
    fontSize: '0.875rem',
    fontWeight: 600,
    background: '#1a73e8',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  checkBtnDisabled: {
    background: '#9ca3af',
    cursor: 'not-allowed',
  },
  overLimitMsg: {
    fontSize: '0.82rem',
    color: '#dc2626',
    margin: 0,
  },
};
