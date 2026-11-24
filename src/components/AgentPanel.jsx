// AgentPanel — live step-by-step investigation using the ScamShield agent.
//
// Props:
//   maskedText    — already-masked message text (from SendPreview)
//   deviceVerdict — { verdict, confidence, category, explanation, redFlags }
//   signals       — { signals, ruleScore } from analyzeSignals()
//   onClose       — () => void

import { useState, useEffect, useRef } from 'react';
import { runAgent, continueAgent } from '../agent/runAgent';

// Tool icons shown in the step timeline
const TOOL_ICONS = {
  analyze_link:            '🔎',
  check_community_reports: '📊',
  search_web:              '🌐',
  get_scam_trends:         '📈',
};

const VERDICT_COLORS = {
  scam:       { bg: '#fef2f2', border: '#fca5a5', badge: '#dc2626', text: '#7f1d1d' },
  suspicious: { bg: '#fffbeb', border: '#fcd34d', badge: '#d97706', text: '#78350f' },
  safe:       { bg: '#f0fdf4', border: '#86efac', badge: '#16a34a', text: '#14532d' },
};

export default function AgentPanel({ maskedText, deviceVerdict, signals, onClose }) {
  const [steps, setSteps]           = useState([]);
  const [finalResult, setFinalResult] = useState(null);
  const [agentSession, setAgentSession] = useState(null);
  const [running, setRunning]       = useState(true);
  const [error, setError]           = useState(null);
  const [followUp, setFollowUp]     = useState('');
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [followUpHistory, setFollowUpHistory] = useState([]); // [{role, text}]
  const bottomRef = useRef(null);

  // Start the agent on mount
  useEffect(() => {
    let cancelled = false;

    runAgent(maskedText, deviceVerdict, signals, (event) => {
      if (cancelled) return;
      if (event.type === 'final') {
        setFinalResult(event.result);
        setRunning(false);
      } else if (event.type === 'error') {
        setError(event.summary ?? 'Investigation failed');
        setRunning(false);
      } else {
        setSteps((prev) => [...prev, event]);
      }
    })
      .then(({ session }) => { if (!cancelled) setAgentSession(session); })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message ?? 'Investigation failed. Please try again.');
        setRunning(false);
      });

    return () => { cancelled = true; };
  }, [maskedText, deviceVerdict, signals]);

  // Scroll to bottom as steps arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [steps, finalResult, followUpHistory]);

  async function handleFollowUp() {
    const text = followUp.trim();
    if (!text || !agentSession || followUpLoading) return;
    setFollowUp('');
    setFollowUpLoading(true);

    try {
      const { text: responseText, maskedFollowUp } = await continueAgent(
        agentSession,
        text,
        (event) => setSteps((prev) => [...prev, event]),
      );
      setFollowUpHistory((prev) => [
        ...prev,
        { role: 'user', text: maskedFollowUp, originalText: text },
        { role: 'assistant', text: responseText },
      ]);
    } catch (err) {
      setFollowUpHistory((prev) => [
        ...prev,
        { role: 'error', text: err?.message ?? 'Follow-up failed. Please try again.' },
      ]);
    } finally {
      setFollowUpLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleFollowUp();
    }
  }

  return (
    <div style={s.wrap}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <div style={s.headerTitle}>ScamShield Agent</div>
          <div style={s.badge}>
            ☁️ Agent reasoning in the cloud · 🔒 tools run on your device · masked text only
          </div>
        </div>
        <button style={s.closeBtn} onClick={onClose} type="button" aria-label="Close">✕</button>
      </div>

      {/* Step timeline */}
      <div style={s.timeline}>
        {steps.map((ev, i) => <StepRow key={i} event={ev} />)}

        {running && (
          <div style={s.runningRow}>
            <span style={s.dot} />
            <span style={s.runningText}>
              {steps.length === 0 ? 'Starting investigation…' : 'Reasoning…'}
            </span>
          </div>
        )}

        {error && (
          <div style={s.errorBox}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Final result card */}
        {finalResult && <FinalResultCard result={finalResult} steps={steps} />}

        {/* Follow-up history */}
        {followUpHistory.map((msg, i) => (
          <div key={i}>
            {msg.role === 'user' && (
              <div style={s.userRow}>
                {msg.text !== msg.originalText && (
                  <div style={s.maskedNote}>Personal numbers masked automatically</div>
                )}
                <div style={s.userBubble}>{msg.text}</div>
              </div>
            )}
            {msg.role === 'assistant' && (
              <div style={s.assistantMsg}>
                <SimpleMarkdown text={msg.text} />
              </div>
            )}
            {msg.role === 'error' && (
              <div style={{ ...s.errorBox, margin: '8px 0' }}>
                {msg.text}
              </div>
            )}
          </div>
        ))}

        {followUpLoading && (
          <div style={s.runningRow}>
            <span style={s.dot} />
            <span style={s.runningText}>Thinking…</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Follow-up input */}
      {!running && agentSession && !error && (
        <>
          <div style={s.inputRow}>
            <textarea
              style={s.textarea}
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a follow-up question… (Enter to send)"
              rows={2}
              disabled={followUpLoading}
            />
            <button
              style={{ ...s.sendBtn, opacity: !followUp.trim() ? 0.5 : 1 }}
              onClick={handleFollowUp}
              type="button"
              disabled={!followUp.trim() || followUpLoading}
            >
              Send
            </button>
          </div>
          <div style={s.inputNote}>
            Phone numbers and other identifiers you type are masked before sending.
          </div>
        </>
      )}
    </div>
  );
}

// ── Step row ───────────────────────────────────────────────────────────────

function StepRow({ event }) {
  if (event.type === 'thinking') {
    return (
      <div style={s.stepRow}>
        <span style={s.stepIcon}>💭</span>
        <span style={s.stepText}>{event.summary}</span>
      </div>
    );
  }

  if (event.type === 'tool_call') {
    const icon = TOOL_ICONS[event.tool] ?? '⚙️';
    return (
      <div style={s.stepRow}>
        <span style={s.stepIcon}>{icon}</span>
        <span style={s.stepText}>{event.summary}</span>
        {event.args && Object.keys(event.args).length > 0 && (
          <span style={s.stepArgs}>{formatArgs(event.args)}</span>
        )}
      </div>
    );
  }

  if (event.type === 'tool_result') {
    const hasError = !!event.result?.error;
    return (
      <div style={{ ...s.stepRow, ...s.stepResultRow }}>
        <span style={s.stepIcon}>{hasError ? '⚠️' : '✓'}</span>
        <span style={{ ...s.stepText, color: hasError ? '#dc2626' : '#374151' }}>
          {event.summary}
        </span>
        <span style={s.durationBadge}>{event.durationMs}ms</span>
        {/* Show search sources inline */}
        {event.tool === 'search_web' && event.result?.sources?.length > 0 && (
          <SourcesList sources={event.result.sources} renderedContent={event.result.renderedContent} />
        )}
        {/* Flag community reports as demo */}
        {event.tool === 'check_community_reports' && event.result?.demo && (
          <span style={s.demoBadge}>demo data</span>
        )}
      </div>
    );
  }

  return null;
}

function formatArgs(args) {
  const entries = Object.entries(args).slice(0, 2);
  return entries.map(([k, v]) => `${k}: "${String(v).slice(0, 60)}"`).join(', ');
}

// ── Final result card ──────────────────────────────────────────────────────

function FinalResultCard({ result }) {
  const vc = VERDICT_COLORS[result.verdict] ?? VERDICT_COLORS.suspicious;
  const verdictLabel = { scam: 'SCAM', suspicious: 'SUSPICIOUS', safe: 'SAFE' }[result.verdict] ?? 'UNKNOWN';

  return (
    <div style={{ ...s.finalCard, background: vc.bg, border: `1px solid ${vc.border}` }}>
      <div style={s.finalHeader}>
        <span style={{ ...s.verdictBadge, background: vc.badge }}>
          {verdictLabel}
        </span>
        <span style={s.confidenceBadge}>{result.confidence} confidence</span>
        <span style={s.agentTag}>Agent verdict</span>
      </div>

      <p style={{ ...s.finalSummary, color: vc.text }}>{result.summary}</p>

      {result.scamTechnique && (
        <div style={s.section}>
          <div style={s.sectionLabel}>Scam technique</div>
          <div style={{ ...s.sectionText, color: vc.text }}>{result.scamTechnique}</div>
        </div>
      )}

      {result.evidence?.length > 0 && (
        <div style={s.section}>
          <div style={s.sectionLabel}>Evidence gathered</div>
          <ul style={s.evidenceList}>
            {result.evidence.map((e, i) => (
              <li key={i} style={s.evidenceItem}>
                <span style={s.evidenceSource}>{TOOL_ICONS[e.source] ?? '•'} {e.source}</span>
                <span style={{ color: vc.text }}>{e.finding}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.nextSteps?.length > 0 && (
        <div style={s.section}>
          <div style={s.sectionLabel}>What to do</div>
          <ul style={s.nextStepsList}>
            {result.nextSteps.map((step, i) => (
              <li key={i} style={s.nextStepItem}>{step}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Sources list (from search_web grounding) ───────────────────────────────

function SourcesList({ sources, renderedContent }) {
  const entryRef = useRef(null);

  useEffect(() => {
    if (!entryRef.current || !renderedContent) return;
    // Required by Google TOS: render grounding entry-point in isolated shadow DOM
    const root = entryRef.current.shadowRoot
      ?? entryRef.current.attachShadow({ mode: 'open' });
    root.innerHTML = renderedContent;
  }, [renderedContent]);

  if (!sources?.length && !renderedContent) return null;

  return (
    <div style={s.sourcesWrap}>
      {sources.length > 0 && (
        <div style={s.sourcesLabel}>Sources</div>
      )}
      <ul style={s.sourcesList}>
        {sources.map((src, i) => (
          <li key={i} style={s.sourcesItem}>
            <a
              href={src.uri}
              target="_blank"
              rel="noopener noreferrer"
              style={s.sourceLink}
            >
              {src.title ?? src.uri}
            </a>
          </li>
        ))}
      </ul>
      {renderedContent && <div ref={entryRef} style={{ marginTop: 4 }} />}
    </div>
  );
}

// ── Simple markdown renderer (no library) ─────────────────────────────────

function SimpleMarkdown({ text }) {
  if (!text) return null;
  const lines = text.split('\n');
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('## ')) {
      elements.push(<h3 key={i} style={md.h3}>{inlineParts(line.slice(3))}</h3>);
    } else if (line.startsWith('### ')) {
      elements.push(<h4 key={i} style={md.h4}>{inlineParts(line.slice(4))}</h4>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      const items = [];
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('* '))) {
        items.push(<li key={i} style={md.li}>{inlineParts(lines[i].slice(2))}</li>);
        i++;
      }
      elements.push(<ul key={`ul-${i}`} style={md.ul}>{items}</ul>);
      continue;
    } else if (line.trim()) {
      elements.push(<p key={i} style={md.p}>{inlineParts(line)}</p>);
    }
    i++;
  }

  return <div style={md.root}>{elements}</div>;
}

function inlineParts(text) {
  return text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part
  );
}

const md = {
  root: { fontSize: '0.875rem', lineHeight: 1.65, color: '#1f2937' },
  h3:   { margin: '14px 0 6px', fontSize: '0.9rem', fontWeight: 700 },
  h4:   { margin: '10px 0 4px', fontSize: '0.85rem', fontWeight: 700 },
  p:    { margin: '0 0 8px' },
  ul:   { margin: '0 0 8px', paddingLeft: 18 },
  li:   { marginBottom: 3 },
};

// ── Styles ─────────────────────────────────────────────────────────────────

const s = {
  wrap: {
    background: '#f8faff',
    border: '1px solid #c7d7fe',
    borderRadius: 10,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '14px 16px 10px',
    background: '#4f46e5',
    color: '#fff',
  },
  headerTitle: {
    fontWeight: 700,
    fontSize: '0.9rem',
    marginBottom: 3,
  },
  badge: {
    fontSize: '0.7rem',
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
  timeline: {
    padding: '16px 16px 8px',
    maxHeight: 600,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  stepRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: 6,
    padding: '4px 0',
    borderBottom: '1px solid #f1f5f9',
  },
  stepResultRow: {
    paddingLeft: 4,
  },
  stepIcon: {
    fontSize: '0.9rem',
    width: 20,
    flexShrink: 0,
  },
  stepText: {
    fontSize: '0.82rem',
    color: '#374151',
    flex: 1,
    minWidth: 100,
  },
  stepArgs: {
    fontSize: '0.72rem',
    color: '#9ca3af',
    fontFamily: 'monospace',
  },
  durationBadge: {
    fontSize: '0.7rem',
    color: '#9ca3af',
    background: '#f3f4f6',
    padding: '1px 5px',
    borderRadius: 4,
    flexShrink: 0,
  },
  demoBadge: {
    fontSize: '0.65rem',
    color: '#fff',
    background: '#6b7280',
    padding: '1px 5px',
    borderRadius: 4,
    flexShrink: 0,
  },
  runningRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 0',
    color: '#6b7280',
    fontSize: '0.82rem',
  },
  dot: {
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#4f46e5',
    animation: 'pulse 1.2s ease-in-out infinite',
    flexShrink: 0,
  },
  runningText: {
    color: '#6b7280',
  },
  errorBox: {
    background: '#fef2f2',
    border: '1px solid #fca5a5',
    borderRadius: 7,
    padding: '10px 12px',
    fontSize: '0.875rem',
    color: '#991b1b',
  },
  finalCard: {
    borderRadius: 8,
    padding: '14px 16px',
    marginTop: 10,
  },
  finalHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  verdictBadge: {
    color: '#fff',
    padding: '3px 10px',
    borderRadius: 99,
    fontSize: '0.75rem',
    fontWeight: 700,
    letterSpacing: '0.05em',
  },
  confidenceBadge: {
    fontSize: '0.75rem',
    color: '#6b7280',
  },
  agentTag: {
    fontSize: '0.68rem',
    color: '#fff',
    background: '#4f46e5',
    padding: '2px 6px',
    borderRadius: 4,
    marginLeft: 'auto',
  },
  finalSummary: {
    fontSize: '0.875rem',
    lineHeight: 1.5,
    margin: '0 0 12px',
    fontWeight: 500,
  },
  section: {
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: '0.7rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    color: '#9ca3af',
    marginBottom: 4,
  },
  sectionText: {
    fontSize: '0.82rem',
    lineHeight: 1.5,
  },
  evidenceList: {
    margin: 0,
    paddingLeft: 0,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  evidenceItem: {
    display: 'flex',
    gap: 8,
    alignItems: 'baseline',
    fontSize: '0.82rem',
    lineHeight: 1.4,
  },
  evidenceSource: {
    fontSize: '0.7rem',
    color: '#6b7280',
    whiteSpace: 'nowrap',
    minWidth: 80,
    flexShrink: 0,
  },
  nextStepsList: {
    margin: 0,
    paddingLeft: 18,
  },
  nextStepItem: {
    fontSize: '0.82rem',
    marginBottom: 4,
    lineHeight: 1.4,
  },
  sourcesWrap: {
    marginTop: 6,
    paddingTop: 6,
    borderTop: '1px solid #e5e7eb',
    width: '100%',
  },
  sourcesLabel: {
    fontSize: '0.65rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    color: '#9ca3af',
    marginBottom: 3,
  },
  sourcesList: {
    margin: 0,
    paddingLeft: 14,
  },
  sourcesItem: {
    fontSize: '0.75rem',
    marginBottom: 2,
  },
  sourceLink: {
    color: '#1d4ed8',
    textDecoration: 'none',
    wordBreak: 'break-word',
  },
  userRow: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    marginTop: 10,
  },
  maskedNote: {
    fontSize: '0.68rem',
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
  assistantMsg: {
    marginTop: 10,
    marginBottom: 4,
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
    border: '1px solid #c7d2fe',
    borderRadius: 7,
    resize: 'none',
    outline: 'none',
    lineHeight: 1.5,
  },
  sendBtn: {
    padding: '8px 16px',
    fontSize: '0.875rem',
    fontWeight: 600,
    background: '#4f46e5',
    color: '#fff',
    border: 'none',
    borderRadius: 7,
    cursor: 'pointer',
    fontFamily: 'inherit',
    flexShrink: 0,
  },
  inputNote: {
    padding: '6px 16px 14px',
    fontSize: '0.7rem',
    color: '#9ca3af',
    fontStyle: 'italic',
  },
};
