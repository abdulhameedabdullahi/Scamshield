// InvestigationPanel — cloud investigation with Google Search grounding.
//
// Props:
//   maskedText    — already-masked message text (from SendPreview)
//   deviceVerdict — { verdict, confidence, category, explanation, redFlags }
//   onClose       — () => void
//
// Security:
//   - Follow-up messages are regex-masked inside continueInvestigation() before sending.
//   - Google Search entry-point HTML is rendered in a shadow DOM (required by TOS).
//   - Sources come from groundingChunks[].web.{title, uri} in the grounding metadata.

import { useState, useEffect, useRef } from 'react';
import { startInvestigation, continueInvestigation } from '../ai/investigate';

export default function InvestigationPanel({ maskedText, deviceVerdict, onClose }) {
  const [messages, setMessages] = useState([]); // [{role, text, groundingMetadata}]
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);  // starts loading immediately on mount
  const [error, setError] = useState(null);
  const [followUp, setFollowUp] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    startInvestigation(maskedText, deviceVerdict, deviceVerdict?.redFlags ?? [])
      .then(({ session: s, text, groundingMetadata }) => {
        if (cancelled) return;
        setSession(s);
        setMessages([{ role: 'assistant', text, groundingMetadata }]);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message ?? 'Investigation failed. Please try again.');
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [maskedText, deviceVerdict]);

  // Scroll to bottom when messages update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, loading]);

  async function handleFollowUp() {
    const text = followUp.trim();
    if (!text || !session || loading) return;

    // Optimistically add user message (will be regex-masked inside continueInvestigation)
    setFollowUp('');
    setLoading(true);
    setError(null);

    try {
      const { text: responseText, groundingMetadata, maskedFollowUp } = await continueInvestigation(session, text);
      setMessages((prev) => [
        ...prev,
        { role: 'user', text: maskedFollowUp, originalText: text },
        { role: 'assistant', text: responseText, groundingMetadata },
      ]);
    } catch (err) {
      setError(err?.message ?? 'Follow-up failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleFollowUp();
    }
  }

  return (
    <div style={styles.wrap}>
      {/* Panel header */}
      <div style={styles.header}>
        <div>
          <div style={styles.headerTitle}>Investigate deeper</div>
          <div style={styles.badge}>
            ☁️ Cloud investigation · masked text only · sources from Google Search
          </div>
        </div>
        <button style={styles.closeBtn} onClick={onClose} type="button" aria-label="Close investigation panel">
          ✕
        </button>
      </div>

      {/* Message thread */}
      <div style={styles.thread}>
        {messages.map((msg, i) => (
          <div key={i}>
            {msg.role === 'user' ? (
              <div style={styles.userMessage}>
                {msg.text !== msg.originalText && (
                  <div style={styles.maskedNote}>Personal numbers masked automatically</div>
                )}
                <div style={styles.userBubble}>{msg.text}</div>
              </div>
            ) : (
              <div style={styles.assistantMessage}>
                <SimpleMarkdown text={msg.text} />
                {msg.groundingMetadata && (
                  <GroundingSection metadata={msg.groundingMetadata} />
                )}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div style={styles.loadingRow}>
            <span style={styles.loadingDot} />
            <span style={styles.loadingText}>
              {messages.length === 0 ? 'Searching the web…' : 'Searching…'}
            </span>
          </div>
        )}

        {error && (
          <div style={styles.errorBox}>
            <strong>Error:</strong> {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Follow-up input */}
      {!loading && session && !error && (
        <div style={styles.inputRow}>
          <textarea
            style={styles.textarea}
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a follow-up question… (press Enter to send)"
            rows={2}
            disabled={loading}
          />
          <button
            style={{ ...styles.sendBtn, opacity: !followUp.trim() ? 0.5 : 1 }}
            onClick={handleFollowUp}
            type="button"
            disabled={!followUp.trim() || loading}
          >
            Send
          </button>
        </div>
      )}
      {!loading && session && (
        <div style={styles.inputNote}>
          Personal numbers you type are masked automatically before sending.
        </div>
      )}
    </div>
  );
}

// ── Simple Markdown renderer (headings, bullets, bold — no library) ───────────

function SimpleMarkdown({ text }) {
  if (!text) return null;
  const lines = text.split('\n');
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('## ')) {
      elements.push(<h3 key={i} style={mdStyles.h3}>{inlineParts(line.slice(3))}</h3>);
    } else if (line.startsWith('### ')) {
      elements.push(<h4 key={i} style={mdStyles.h4}>{inlineParts(line.slice(4))}</h4>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      const items = [];
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('* '))) {
        items.push(<li key={i} style={mdStyles.li}>{inlineParts(lines[i].slice(2))}</li>);
        i++;
      }
      elements.push(<ul key={`ul-${i}`} style={mdStyles.ul}>{items}</ul>);
      continue;
    } else if (line.trim()) {
      elements.push(<p key={i} style={mdStyles.p}>{inlineParts(line)}</p>);
    }

    i++;
  }

  return <div style={mdStyles.root}>{elements}</div>;
}

function inlineParts(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part
  );
}

const mdStyles = {
  root: { fontSize: '0.875rem', lineHeight: 1.65, color: '#1f2937' },
  h3:   { margin: '14px 0 6px', fontSize: '0.9rem', fontWeight: 700, color: '#111827' },
  h4:   { margin: '10px 0 4px', fontSize: '0.85rem', fontWeight: 700, color: '#374151' },
  p:    { margin: '0 0 10px' },
  ul:   { margin: '0 0 10px', paddingLeft: 20 },
  li:   { marginBottom: 4 },
};

// ── Grounding section: sources + search entry point ───────────────────────────

function GroundingSection({ metadata }) {
  const chunks = metadata?.groundingChunks ?? [];
  const webSources = chunks
    .map((c) => c.web)
    .filter((w) => w?.uri);
  const renderedContent = metadata?.searchEntryPoint?.renderedContent ?? null;

  if (!webSources.length && !renderedContent) return null;

  return (
    <div style={groundingStyles.wrap}>
      {webSources.length > 0 && (
        <div style={groundingStyles.section}>
          <div style={groundingStyles.label}>Sources</div>
          <ul style={groundingStyles.list}>
            {webSources.map((w, i) => (
              <li key={i} style={groundingStyles.item}>
                <a
                  href={w.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={groundingStyles.link}
                >
                  {w.title ?? w.uri}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {renderedContent && <SearchEntryPoint html={renderedContent} />}
    </div>
  );
}

function SearchEntryPoint({ html }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current || !html) return;
    // Required by Google TOS: render grounding entry-point in an isolated shadow DOM
    const root = ref.current.shadowRoot ?? ref.current.attachShadow({ mode: 'open' });
    root.innerHTML = html;
  }, [html]);

  return <div ref={ref} style={{ marginTop: 8 }} />;
}

const groundingStyles = {
  wrap: {
    marginTop: 12,
    paddingTop: 10,
    borderTop: '1px solid #e5e7eb',
  },
  section: {
    marginBottom: 8,
  },
  label: {
    fontSize: '0.72rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#9ca3af',
    marginBottom: 4,
  },
  list: {
    margin: 0,
    paddingLeft: 16,
  },
  item: {
    fontSize: '0.78rem',
    marginBottom: 3,
  },
  link: {
    color: '#1d4ed8',
    textDecoration: 'none',
    wordBreak: 'break-word',
  },
};

const styles = {
  wrap: {
    background: '#f0f9ff',
    border: '1px solid #bae6fd',
    borderRadius: 10,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '14px 16px 10px',
    background: '#0ea5e9',
    color: '#fff',
  },
  headerTitle: {
    fontWeight: 700,
    fontSize: '0.9rem',
    marginBottom: 3,
  },
  badge: {
    fontSize: '0.72rem',
    opacity: 0.9,
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#fff',
    fontSize: '1rem',
    cursor: 'pointer',
    padding: '0 0 0 12px',
    lineHeight: 1,
    flexShrink: 0,
  },
  thread: {
    padding: '16px 16px 8px',
    maxHeight: 480,
    overflowY: 'auto',
  },
  userMessage: {
    marginBottom: 16,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  maskedNote: {
    fontSize: '0.7rem',
    color: '#9ca3af',
    marginBottom: 3,
    fontStyle: 'italic',
  },
  userBubble: {
    background: '#1d4ed8',
    color: '#fff',
    padding: '8px 12px',
    borderRadius: 10,
    borderBottomRightRadius: 3,
    fontSize: '0.875rem',
    maxWidth: '80%',
    wordBreak: 'break-word',
  },
  assistantMessage: {
    marginBottom: 20,
  },
  loadingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 0',
    color: '#6b7280',
    fontSize: '0.875rem',
  },
  loadingDot: {
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#3b82f6',
    animation: 'pulse 1.2s ease-in-out infinite',
    flexShrink: 0,
  },
  loadingText: {},
  errorBox: {
    background: '#fef2f2',
    border: '1px solid #fca5a5',
    borderRadius: 7,
    padding: '10px 12px',
    fontSize: '0.875rem',
    color: '#991b1b',
    marginBottom: 12,
  },
  inputRow: {
    display: 'flex',
    gap: 8,
    padding: '0 16px',
    alignItems: 'flex-start',
  },
  textarea: {
    flex: 1,
    padding: '8px 10px',
    fontSize: '0.875rem',
    fontFamily: 'inherit',
    border: '1px solid #93c5fd',
    borderRadius: 7,
    resize: 'none',
    outline: 'none',
    lineHeight: 1.5,
  },
  sendBtn: {
    padding: '8px 16px',
    fontSize: '0.875rem',
    fontWeight: 600,
    background: '#0ea5e9',
    color: '#fff',
    border: 'none',
    borderRadius: 7,
    cursor: 'pointer',
    fontFamily: 'inherit',
    flexShrink: 0,
  },
  inputNote: {
    padding: '6px 16px 14px',
    fontSize: '0.72rem',
    color: '#9ca3af',
    fontStyle: 'italic',
  },
};
