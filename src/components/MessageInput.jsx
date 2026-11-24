// MessageInput — chat composer pinned at the bottom of the screen.
// Props: value, onChange, onCheck, onClear, disabled

import { useRef } from 'react';
import { Send, Clipboard } from 'lucide-react';

const MAX_CHARS = 2000;

export default function MessageInput({ value, onChange, onCheck, onClear, disabled }) {
  const textareaRef = useRef(null);
  const count = value.length;
  const overLimit = count > MAX_CHARS;
  const canCheck = count > 0 && !overLimit && !disabled;

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) onChange(text);
    } catch {
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey && canCheck) {
      e.preventDefault();
      onCheck();
    }
  }

  return (
    <div style={S.wrap}>
      <div style={{ ...S.box, ...(overLimit ? S.boxOver : {}) }}>
        <textarea
          ref={textareaRef}
          id="message-input"
          style={S.textarea}
          placeholder="Paste the message here…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          disabled={disabled}
          spellCheck={false}
          aria-label="Message to check"
          aria-describedby={overLimit ? 'msg-over-limit' : undefined}
        />
        <div style={S.row}>
          <span style={{ ...S.counter, ...(overLimit ? S.counterOver : {}) }}>
            {overLimit
              ? `Too long — shorten by ${(count - MAX_CHARS).toLocaleString()} characters`
              : count > 0
                ? `${count.toLocaleString()} / ${MAX_CHARS.toLocaleString()}`
                : ''}
          </span>
          <div style={S.actions}>
            {!value && (
              <button
                style={S.pasteBtn}
                onClick={handlePaste}
                type="button"
                title="Paste from clipboard"
                aria-label="Paste from clipboard"
              >
                <Clipboard size={18} strokeWidth={1.75} />
                <span>Paste</span>
              </button>
            )}
            {value && !disabled && (
              <button
                style={S.clearBtn}
                onClick={onClear}
                type="button"
                aria-label="Clear message"
              >
                Clear
              </button>
            )}
            <button
              style={{ ...S.checkBtn, ...(!canCheck ? S.checkBtnDisabled : {}) }}
              onClick={onCheck}
              disabled={!canCheck}
              type="button"
              aria-busy={disabled}
            >
              {disabled ? (
                <span style={S.checkingLabel}>Checking…</span>
              ) : (
                <>
                  <span>Check message</span>
                  <Send size={16} strokeWidth={2} aria-hidden="true" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
      {overLimit && (
        <p id="msg-over-limit" style={S.overMsg} role="alert">
          Please shorten the message to {MAX_CHARS.toLocaleString()} characters or fewer.
        </p>
      )}
    </div>
  );
}

const S = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  box: {
    background: '#fff',
    border: '1.5px solid var(--line)',
    borderRadius: 'var(--r-input)',
    overflow: 'hidden',
    transition: 'border-color 0.15s',
  },
  boxOver: {
    borderColor: 'var(--scam)',
  },
  textarea: {
    display: 'block',
    width: '100%',
    padding: '12px 14px 6px',
    fontSize: '1rem',
    fontFamily: 'var(--font-body)',
    lineHeight: 1.55,
    border: 'none',
    outline: 'none',
    resize: 'none',
    color: 'var(--ink)',
    background: 'transparent',
    boxSizing: 'border-box',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 10px 10px',
    gap: 8,
    flexWrap: 'wrap',
  },
  counter: {
    fontSize: '0.8125rem',
    color: '#aaa',
  },
  counterOver: {
    color: 'var(--scam)',
    fontWeight: 600,
  },
  actions: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  pasteBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '8px 14px',
    fontSize: '0.875rem',
    background: 'var(--plum-100)',
    color: 'var(--plum-700)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--r-btn)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    minHeight: 44,
  },
  clearBtn: {
    padding: '8px 14px',
    fontSize: '0.875rem',
    background: 'transparent',
    color: '#888',
    border: '1px solid var(--line)',
    borderRadius: 'var(--r-btn)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    minHeight: 44,
  },
  checkBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
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
  checkBtnDisabled: {
    background: '#ccc',
    cursor: 'not-allowed',
  },
  checkingLabel: {
    fontWeight: 600,
  },
  overMsg: {
    fontSize: '0.8125rem',
    color: 'var(--scam)',
  },
};
