// AgentPanel — live step-by-step investigation using the ScamShield Agent.
// Renders as a series of ScamShield chat bubbles inside the conversation thread.
//
// Props: maskedText, deviceVerdict, signals, onClose

import { useState, useEffect, useRef } from 'react';
import { runAgent, continueAgent } from '../agent/runAgent';

const TOOL_LABEL = {
  analyze_link:            'Checking the link',
  check_community_reports: 'Checking community reports',
  search_web:              'Searching online',
  get_scam_trends:         'Checking current scam patterns',
};

const TOOL_ICON = {
  analyze_link:            '🔎',
  check_community_reports: '📊',
  search_web:              '🌐',
  get_scam_trends:         '📈',
};

const VERDICT_CFG = {
  scam:       { bg: 'var(--scam-bg)',  border: '#FECACA', color: 'var(--scam)',  label: '🚨 Scam confirmed'     },
  suspicious: { bg: 'var(--warn-bg)',  border: '#FDE68A', color: 'var(--warn)',  label: '⚠️ Suspicious'          },
  safe:       { bg: 'var(--safe-bg)',  border: '#A7F3D0', color: 'var(--safe)',  label: '✅ Looks safe'          },
};

export default function AgentPanel({ maskedText, deviceVerdict, signals, onClose }) {
  const [steps, setSteps]                   = useState([]);
  const [finalResult, setFinalResult]       = useState(null);
  const [agentSession, setAgentSession]     = useState(null);
  const [running, setRunning]               = useState(true);
  const [error, setError]                   = useState(null);
  const [followUp, setFollowUp]             = useState('');
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [followUpHistory, setFollowUpHistory] = useState([]);
  const bottomRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    runAgent(maskedText, deviceVerdict, signals, (event) => {
      if (cancelled) return;
      if (event.type === 'final') {
        setFinalResult(event.result);
        setRunning(false);
      } else if (event.type === 'error') {
        setError(event.summary ?? 'Investigation failed. Check your internet and try again.');
        setRunning(false);
      } else {
        setSteps((prev) => [...prev, event]);
      }
    })
      .then(({ session }) => { if (!cancelled) setAgentSession(session); })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message ?? 'Investigation failed. Check your internet and try again.');
        setRunning(false);
      });

    return () => { cancelled = true; };
  }, [maskedText, deviceVerdict, signals]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [steps, finalResult, followUpHistory]);

  async function handleFollowUp() {
    const txt = followUp.trim();
    if (!txt || !agentSession || followUpLoading) return;
    setFollowUp('');
    setFollowUpLoading(true);
    try {
      const { text: responseText, maskedFollowUp } = await continueAgent(
        agentSession, txt,
        (event) => setSteps((prev) => [...prev, event]),
      );
      setFollowUpHistory((prev) => [
        ...prev,
        { role: 'user', text: maskedFollowUp, originalText: txt },
        { role: 'assistant', text: responseText },
      ]);
    } catch (err) {
      setFollowUpHistory((prev) => [
        ...prev,
        { role: 'error', text: err?.message ?? 'Couldn\'t get a reply. Check your internet and try again.' },
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
    <div style={S.wrap}>
      {/* Badge */}
      <div style={S.badge}>
        ☁️ Agent reasoning online &nbsp;·&nbsp; 🔒 tools run on this phone &nbsp;·&nbsp; masked text only
      </div>

      {/* Step timeline */}
      <div style={S.timeline}>
        {steps.map((ev, i) => <StepRow key={i} event={ev} />)}

        {running && (
          <div style={S.typingRow}>
            <div className="typing-dots">
              <div className="typing-dot" />
              <div className="typing-dot" />
              <div className="typing-dot" />
            </div>
            <span style={S.typingLabel}>
              {steps.length === 0 ? 'Starting investigation…' : 'Thinking…'}
            </span>
          </div>
        )}

        {error && (
          <div style={S.errorBubble} role="alert">
            <strong>Couldn't finish the investigation.</strong> {error}
          </div>
        )}

        {finalResult && <FinalResultBubble result={finalResult} />}

        {/* Follow-up history */}
        {followUpHistory.map((msg, i) => (
          <div key={i}>
            {msg.role === 'user' && (
              <div style={S.userRow}>
                {msg.text !== msg.originalText && (
                  <div style={S.maskedNote}>Personal numbers hidden automatically</div>
                )}
                <div style={S.userBubble}>{msg.text}</div>
              </div>
            )}
            {msg.role === 'assistant' && (
              <div style={S.assistantBubble}>
                <SimpleMarkdown text={msg.text} />
              </div>
            )}
            {msg.role === 'error' && (
              <div style={S.errorBubble}>{msg.text}</div>
            )}
          </div>
        ))}

        {followUpLoading && (
          <div style={S.typingRow}>
            <div className="typing-dots">
              <div className="typing-dot" />
              <div className="typing-dot" />
              <div className="typing-dot" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Follow-up input */}
      {!running && agentSession && !error && (
        <div style={S.followUpWrap}>
          <div style={S.followUpBox}>
            <textarea
              style={S.followUpTextarea}
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a follow-up question…"
              rows={2}
              disabled={followUpLoading}
              aria-label="Follow-up question"
            />
            <button
              style={{ ...S.followUpSend, opacity: followUp.trim() ? 1 : 0.4 }}
              onClick={handleFollowUp}
              type="button"
              disabled={!followUp.trim() || followUpLoading}
              aria-label="Send follow-up"
            >
              Send
            </button>
          </div>
          <p style={S.followUpNote}>
            Phone numbers you type are hidden before sending.
          </p>
        </div>
      )}

      {/* Close */}
      <button style={S.closeBtn} onClick={onClose} type="button" aria-label="Close investigation">
        Close investigation
      </button>
    </div>
  );
}

// ── Step row ───────────────────────────────────────────────────────────────

function StepRow({ event }) {
  const isDone = event.type === 'tool_result';
  const hasError = isDone && !!event.result?.error;
  const isDemo = event.tool === 'check_community_reports' && event.result?.demo;

  if (event.type === 'thinking') {
    return (
      <div style={S.stepBubble}>
        <span style={S.stepIcon}>💭</span>
        <span style={S.stepText}>{event.summary}</span>
      </div>
    );
  }

  if (event.type === 'tool_call') {
    const icon = TOOL_ICON[event.tool] ?? '⚙️';
    const label = TOOL_LABEL[event.tool] ?? event.tool;
    return (
      <div style={S.stepBubble}>
        <span style={S.stepIcon}>{icon}</span>
        <span style={S.stepText}>{label}…</span>
      </div>
    );
  }

  if (event.type === 'tool_result') {
    return (
      <div style={{ ...S.stepBubble, ...S.stepDone }}>
        <span style={S.stepIcon}>{hasError ? '⚠️' : '✓'}</span>
        <span style={{ ...S.stepText, color: hasError ? 'var(--scam)' : undefined }}>
          {event.summary}
        </span>
        {isDemo && <span style={S.demoTag}>demo data</span>}
        <span style={S.duration}>{event.durationMs}ms</span>
        {event.tool === 'search_web' && event.result?.sources?.length > 0 && (
          <SourcesList
            sources={event.result.sources}
            renderedContent={event.result.renderedContent}
          />
        )}
      </div>
    );
  }

  return null;
}

// ── Final result bubble ────────────────────────────────────────────────────

function FinalResultBubble({ result }) {
  const vc = VERDICT_CFG[result.verdict] ?? VERDICT_CFG.suspicious;

  return (
    <div
      className="verdict-enter"
      style={{ ...S.finalBubble, background: vc.bg, border: `1px solid ${vc.border}` }}
      role="region"
      aria-label="Agent verdict"
    >
      <div style={S.finalHeader}>
        <span style={{ ...S.verdictBadge, color: vc.color }}>{vc.label}</span>
        <span style={S.agentTag}>Agent verdict</span>
      </div>

      <p style={{ ...S.finalSummary, color: vc.color }}>{result.summary}</p>

      {result.scamTechnique && (
        <div style={S.finalSection}>
          <div style={S.finalSectionLabel}>How this trick works</div>
          <p style={S.finalSectionText}>{result.scamTechnique}</p>
        </div>
      )}

      {result.evidence?.length > 0 && (
        <div style={S.finalSection}>
          <div style={S.finalSectionLabel}>What I found</div>
          <ul style={S.evidenceList}>
            {result.evidence.map((e, i) => (
              <li key={i} style={S.evidenceItem}>
                <span style={S.evidenceSrc}>{TOOL_ICON[e.source] ?? '•'}</span>
                <span>{e.finding}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.nextSteps?.length > 0 && (
        <div style={S.finalSection}>
          <div style={S.finalSectionLabel}>What to do now</div>
          <ul style={S.nextList}>
            {result.nextSteps.map((step, i) => (
              <li key={i} style={S.nextItem}>
                <span aria-hidden="true">☑</span>
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Sources list ───────────────────────────────────────────────────────────

function SourcesList({ sources, renderedContent }) {
  const entryRef = useRef(null);

  useEffect(() => {
    if (!entryRef.current || !renderedContent) return;
    const root = entryRef.current.shadowRoot
      ?? entryRef.current.attachShadow({ mode: 'open' });
    root.innerHTML = renderedContent;
  }, [renderedContent]);

  if (!sources?.length && !renderedContent) return null;

  return (
    <div style={S.sourcesWrap}>
      {sources.length > 0 && (
        <ul style={S.sourcesList}>
          {sources.map((src, i) => (
            <li key={i} style={S.sourcesItem}>
              <a href={src.uri} target="_blank" rel="noopener noreferrer" style={S.sourceLink}>
                {src.title ?? src.uri}
              </a>
            </li>
          ))}
        </ul>
      )}
      {renderedContent && <div ref={entryRef} style={{ marginTop: 4 }} />}
    </div>
  );
}

// ── Simple markdown renderer ───────────────────────────────────────────────

function SimpleMarkdown({ text }) {
  if (!text) return null;
  const lines = text.split('\n');
  const els = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('## '))       els.push(<h3 key={i} style={md.h3}>{inline(line.slice(3))}</h3>);
    else if (line.startsWith('### ')) els.push(<h4 key={i} style={md.h4}>{inline(line.slice(4))}</h4>);
    else if (line.startsWith('- ') || line.startsWith('* ')) {
      const items = [];
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('* '))) {
        items.push(<li key={i} style={md.li}>{inline(lines[i].slice(2))}</li>);
        i++;
      }
      els.push(<ul key={`ul-${i}`} style={md.ul}>{items}</ul>);
      continue;
    } else if (line.trim()) {
      els.push(<p key={i} style={md.p}>{inline(line)}</p>);
    }
    i++;
  }
  return <div style={md.root}>{els}</div>;
}

function inline(text) {
  return text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part
  );
}

const md = {
  root: { fontSize: '0.9375rem', lineHeight: 1.6 },
  h3:   { margin: '12px 0 5px', fontSize: '0.9375rem', fontWeight: 700 },
  h4:   { margin: '10px 0 4px', fontSize: '0.875rem',  fontWeight: 700 },
  p:    { margin: '0 0 8px' },
  ul:   { margin: '0 0 8px', paddingLeft: 18 },
  li:   { marginBottom: 3 },
};

// ── Styles ─────────────────────────────────────────────────────────────────

const S = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    maxWidth: '100%',
  },
  badge: {
    fontSize: '0.75rem',
    color: '#888',
    padding: '4px 2px',
    textAlign: 'left',
  },
  timeline: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  stepBubble: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: 8,
    padding: '10px 14px',
    background: 'var(--plum-100)',
    borderRadius: 'var(--r-bubble-in)',
    maxWidth: '90%',
  },
  stepDone: {
    background: '#fff',
    border: '1px solid var(--line)',
  },
  stepIcon: {
    fontSize: '1rem',
    flexShrink: 0,
  },
  stepText: {
    fontSize: '0.9375rem',
    color: 'var(--ink)',
    flex: 1,
    minWidth: 100,
  },
  demoTag: {
    fontSize: '0.75rem',
    color: '#fff',
    background: '#888',
    padding: '2px 7px',
    borderRadius: 'var(--r-chip)',
    flexShrink: 0,
  },
  duration: {
    fontSize: '0.75rem',
    color: '#aaa',
    flexShrink: 0,
  },
  typingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 14px',
    background: 'var(--plum-100)',
    borderRadius: 'var(--r-bubble-in)',
    maxWidth: 120,
  },
  typingLabel: {
    fontSize: '0.875rem',
    color: '#888',
  },
  errorBubble: {
    padding: '12px 16px',
    background: 'var(--scam-bg)',
    border: '1px solid #FECACA',
    borderRadius: 'var(--r-bubble-in)',
    fontSize: '0.9375rem',
    color: 'var(--scam)',
    maxWidth: '90%',
  },
  finalBubble: {
    padding: '18px 20px',
    borderRadius: 'var(--r-bubble-in)',
    maxWidth: '96%',
  },
  finalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    flexWrap: 'wrap',
    gap: 8,
  },
  verdictBadge: {
    fontFamily: 'var(--font-heading)',
    fontSize: '1.0625rem',
    fontWeight: 600,
  },
  agentTag: {
    fontSize: '0.75rem',
    color: '#fff',
    background: 'var(--plum-700)',
    padding: '2px 8px',
    borderRadius: 'var(--r-chip)',
  },
  finalSummary: {
    fontSize: '0.9375rem',
    fontWeight: 600,
    lineHeight: 1.5,
    marginBottom: 14,
  },
  finalSection: {
    marginBottom: 12,
  },
  finalSectionLabel: {
    fontSize: '0.8125rem',
    fontWeight: 700,
    color: '#666',
    marginBottom: 5,
  },
  finalSectionText: {
    fontSize: '0.9375rem',
    lineHeight: 1.5,
    margin: 0,
  },
  evidenceList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  evidenceItem: {
    display: 'flex',
    gap: 8,
    fontSize: '0.9375rem',
    lineHeight: 1.4,
  },
  evidenceSrc: {
    flexShrink: 0,
    width: 20,
  },
  nextList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  nextItem: {
    display: 'flex',
    gap: 8,
    fontSize: '0.9375rem',
    lineHeight: 1.4,
  },
  sourcesWrap: {
    marginTop: 8,
    paddingTop: 8,
    borderTop: '1px solid var(--line)',
    width: '100%',
  },
  sourcesList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  sourcesItem: {
    fontSize: '0.8125rem',
  },
  sourceLink: {
    color: 'var(--plum-700)',
    textDecoration: 'none',
    wordBreak: 'break-word',
  },
  userRow: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    marginTop: 6,
  },
  maskedNote: {
    fontSize: '0.75rem',
    color: '#aaa',
    marginBottom: 3,
    fontStyle: 'italic',
  },
  userBubble: {
    background: 'var(--plum-700)',
    color: '#fff',
    padding: '10px 14px',
    borderRadius: 'var(--r-bubble-out)',
    fontSize: '0.9375rem',
    maxWidth: '82%',
    wordBreak: 'break-word',
  },
  assistantBubble: {
    padding: '12px 16px',
    background: 'var(--plum-100)',
    borderRadius: 'var(--r-bubble-in)',
    maxWidth: '90%',
    marginTop: 6,
  },
  followUpWrap: {
    marginTop: 6,
  },
  followUpBox: {
    display: 'flex',
    gap: 8,
    alignItems: 'flex-end',
  },
  followUpTextarea: {
    flex: 1,
    padding: '10px 12px',
    fontSize: '0.9375rem',
    fontFamily: 'var(--font-body)',
    border: '1.5px solid var(--line)',
    borderRadius: 'var(--r-input)',
    resize: 'none',
    outline: 'none',
    lineHeight: 1.5,
    background: '#fff',
  },
  followUpSend: {
    padding: '10px 18px',
    fontSize: '0.9375rem',
    fontWeight: 700,
    background: 'var(--plum-700)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--r-btn)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    flexShrink: 0,
    minHeight: 48,
  },
  followUpNote: {
    fontSize: '0.8125rem',
    color: '#aaa',
    marginTop: 4,
    fontStyle: 'italic',
  },
  closeBtn: {
    padding: '10px 20px',
    fontSize: '0.875rem',
    background: 'transparent',
    color: '#888',
    border: '1px solid var(--line)',
    borderRadius: 'var(--r-btn)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    marginTop: 6,
    alignSelf: 'flex-start',
    minHeight: 44,
  },
};
