// MessageInput — chat composer pinned at the bottom of the screen.
// Props: value, onChange, onCheck, onClear, disabled, onImageFile, imagePreview, onClearImage

import { useRef } from 'react';
import { Send, Clipboard, Image, X } from 'lucide-react';

const MAX_CHARS = 2000;

export default function MessageInput({
  value, onChange, onCheck, onClear, disabled,
  onImageFile, imagePreview, onClearImage,
}) {
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const count = value.length;
  const overLimit = count > MAX_CHARS;
  const hasImage = !!imagePreview;
  const canCheck = (count > 0 || hasImage) && !overLimit && !disabled;

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) onChange(text);
    } catch {
      textareaRef.current?.focus();
    }
  }

  // Intercept paste events that contain an image
  function handleTextareaPaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) onImageFile?.(file);
        return;
      }
    }
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) onImageFile?.(file);
    // Reset so the same file can be re-selected
    e.target.value = '';
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey && canCheck) {
      e.preventDefault();
      onCheck();
    }
  }

  return (
    <div style={S.wrap}>
      {/* Image preview strip */}
      {hasImage && (
        <div style={S.imagePreviewWrap}>
          <img src={imagePreview} alt="Pasted screenshot" style={S.imageThumb} />
          <div style={S.imageLabel}>Screenshot ready to check</div>
          <button
            style={S.imageClear}
            onClick={onClearImage}
            type="button"
            aria-label="Remove image"
            disabled={disabled}
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      )}

      <div className={`composer-box${overLimit ? ' over-limit' : ''}`}>
        <textarea
          ref={textareaRef}
          id="message-input"
          style={S.textarea}
          placeholder={hasImage ? 'Add context (optional)…' : 'Paste the message here…'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handleTextareaPaste}
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
            {/* Hidden file input for image upload */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFileChange}
              aria-label="Upload screenshot"
            />

            {!value && !hasImage && (
              <>
                <button
                  className="btn-outline-plum"
                  onClick={handlePaste}
                  type="button"
                  title="Paste text from clipboard"
                  aria-label="Paste from clipboard"
                >
                  <Clipboard size={18} strokeWidth={1.75} />
                  <span>Paste</span>
                </button>
                <button
                  className="btn-outline-plum"
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                  title="Upload a screenshot"
                  aria-label="Upload screenshot"
                  disabled={disabled}
                >
                  <Image size={18} strokeWidth={1.75} />
                </button>
              </>
            )}
            {(value || hasImage) && !disabled && (
              <button
                className="btn-ghost"
                onClick={onClear}
                type="button"
                aria-label="Clear message"
              >
                Clear
              </button>
            )}
            <button
              className="btn-check"
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
  imagePreviewWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 12px',
    background: 'var(--plum-100)',
    borderRadius: 10,
    marginBottom: 4,
  },
  imageThumb: {
    width: 48,
    height: 48,
    objectFit: 'cover',
    borderRadius: 6,
    border: '1px solid var(--line)',
    flexShrink: 0,
  },
  imageLabel: {
    fontSize: '0.875rem',
    color: 'var(--plum-900)',
    flex: 1,
  },
  imageClear: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: 4,
    color: '#888',
    borderRadius: 6,
    flexShrink: 0,
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
  checkingLabel: {
    fontWeight: 600,
  },
  overMsg: {
    fontSize: '0.8125rem',
    color: 'var(--scam)',
  },
};
