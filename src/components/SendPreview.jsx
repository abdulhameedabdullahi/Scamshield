// SendPreview — shows detected PII entities as chips so the user can review
// and toggle what gets masked before any cloud call is made.
//
// Props:
//   originalText  — raw message text
//   entities      — from detectEntities(): [{text, type, start, end, source, defaultAction}]
//   regexOnly     — true when on-device AI was unavailable (regex masking only)
//   onSend        — (maskedText) => void  called when user confirms
//   onCancel      — () => void
//
// Security: placeholderMap (original values) is computed inside this component and
// never passed out. onSend only receives the masked string.

import { useState, useMemo } from 'react';
import { buildMaskedText } from '../ai/maskMessage';
import { MASK_POLICY, MASK_POLICY_LABELS, PLACEHOLDER_TYPES } from '../config';

export default function SendPreview({ originalText, entities, regexOnly, onSend, onCancel }) {
  const [overrides, setOverrides] = useState({});

  // Current action for each entity (considering overrides)
  const actions = useMemo(
    () => entities.map((e, i) => overrides[i] ?? e.defaultAction ?? (MASK_POLICY[e.type] === 'mask' ? 'mask' : 'keep')),
    [entities, overrides],
  );

  // maskedText + entityPlaceholders (placeholder label per entity, null if kept)
  const { maskedText, entityPlaceholders } = useMemo(
    () => buildMaskedText(originalText, entities, overrides),
    [originalText, entities, overrides],
  );

  const maskedCount = actions.filter((a) => a === 'mask').length;

  function toggle(idx) {
    setOverrides((prev) => ({ ...prev, [idx]: actions[idx] === 'mask' ? 'keep' : 'mask' }));
  }

  // Split original text into plain-text and entity segments
  const segments = buildSegments(originalText, entities);

  return (
    <div style={styles.wrap}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.lock}>&#128274;</span>
        <div>
          <div style={styles.headerTitle}>
            {entities.length > 0
              ? `${maskedCount} personal detail${maskedCount !== 1 ? 's' : ''} detected and masked on your device`
              : 'No personal details detected'}
          </div>
          {regexOnly && (
            <div style={styles.regexOnly}>
              Basic masking only — private AI unavailable on this device.
            </div>
          )}
        </div>
      </div>

      {/* Message with chips */}
      {entities.length > 0 && (
        <>
          <div style={styles.sectionLabel}>Review and tap to toggle:</div>
          <div style={styles.messageBox}>
            {segments.map((seg, i) => {
              if (seg.entityIdx == null) {
                return <span key={i} style={styles.plainText}>{seg.text}</span>;
              }
              const idx = seg.entityIdx;
              const action = actions[idx];
              const entity = entities[idx];
              const placeholder = entityPlaceholders[idx] ?? `[${PLACEHOLDER_TYPES[entity.type] ?? 'ITEM'}]`;
              const isKept = action === 'keep';
              const keepLabel = MASK_POLICY_LABELS[entity.type];
              return (
                <button
                  key={i}
                  type="button"
                  style={isKept ? styles.chipKept : styles.chipMasked}
                  title={isKept ? (keepLabel ?? 'Click to mask this') : 'Click to send original value'}
                  onClick={() => toggle(idx)}
                  aria-label={isKept ? `${entity.text} — kept as evidence. Click to mask.` : `${placeholder} — masked. Click to keep.`}
                >
                  {isKept
                    ? <><span style={styles.chipText}>{entity.text}</span><span style={styles.chipTag}> evidence</span></>
                    : <><span style={{ textDecoration: 'line-through', opacity: 0.6, fontSize: '0.75em' }}>{entity.text}</span><span style={styles.chipTag}> {placeholder}</span></>
                  }
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div style={styles.legend}>
            <span style={styles.legendItem}>
              <span style={{ ...styles.legendSwatch, background: '#fee2e2' }} />
              Masked — tap to send original
            </span>
            <span style={styles.legendItem}>
              <span style={{ ...styles.legendSwatch, background: '#dbeafe' }} />
              Kept as evidence — tap to mask
            </span>
          </div>
        </>
      )}

      {/* Final masked text preview */}
      <div style={styles.previewSection}>
        <div style={styles.previewLabel}>This exact text will be sent:</div>
        <pre style={styles.previewText}>{maskedText}</pre>
      </div>

      {/* Action buttons */}
      <div style={styles.buttonRow}>
        <button style={styles.cancelBtn} onClick={onCancel} type="button">
          Cancel
        </button>
        <button style={styles.sendBtn} onClick={() => onSend(maskedText)} type="button">
          Send for investigation
        </button>
      </div>
    </div>
  );
}

/**
 * Split `text` into segments: plain text and entity slots.
 * @param {string} text
 * @param {Array} entities - sorted by start position
 * @returns {Array<{text: string, entityIdx: number|null}>}
 */
function buildSegments(text, entities) {
  const segments = [];
  let pos = 0;
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    if (e.start > pos) {
      segments.push({ text: text.slice(pos, e.start), entityIdx: null });
    }
    segments.push({ text: text.slice(e.start, e.end), entityIdx: i });
    pos = e.end;
  }
  if (pos < text.length) {
    segments.push({ text: text.slice(pos), entityIdx: null });
  }
  return segments;
}

const styles = {
  wrap: {
    background: '#f0fdf4',
    border: '1px solid #86efac',
    borderRadius: 10,
    padding: '16px 18px',
  },
  header: {
    display: 'flex',
    gap: 10,
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  lock: {
    fontSize: '1.2rem',
    lineHeight: 1,
    flexShrink: 0,
    marginTop: 2,
  },
  headerTitle: {
    fontWeight: 700,
    fontSize: '0.9rem',
    color: '#14532d',
  },
  regexOnly: {
    fontSize: '0.78rem',
    color: '#6b7280',
    marginTop: 3,
    fontStyle: 'italic',
  },
  sectionLabel: {
    fontSize: '0.78rem',
    fontWeight: 600,
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 6,
  },
  messageBox: {
    padding: '10px 12px',
    background: '#fff',
    border: '1px solid #bbf7d0',
    borderRadius: 7,
    fontSize: '0.875rem',
    lineHeight: 1.9,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    marginBottom: 8,
  },
  plainText: {
    whiteSpace: 'pre-wrap',
  },
  chipMasked: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 2,
    padding: '1px 7px',
    background: '#fee2e2',
    color: '#991b1b',
    border: '1px solid #fca5a5',
    borderRadius: 99,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '0.82rem',
    fontWeight: 500,
    verticalAlign: 'middle',
    margin: '0 1px',
  },
  chipKept: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 2,
    padding: '1px 7px',
    background: '#dbeafe',
    color: '#1e40af',
    border: '1px solid #93c5fd',
    borderRadius: 99,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '0.82rem',
    fontWeight: 500,
    verticalAlign: 'middle',
    margin: '0 1px',
  },
  chipText: {},
  chipTag: {
    fontSize: '0.72rem',
    opacity: 0.75,
    marginLeft: 1,
  },
  legend: {
    display: 'flex',
    gap: 16,
    flexWrap: 'wrap',
    marginBottom: 14,
    fontSize: '0.75rem',
    color: '#6b7280',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
  },
  legendSwatch: {
    display: 'inline-block',
    width: 10,
    height: 10,
    borderRadius: 2,
    flexShrink: 0,
  },
  previewSection: {
    marginBottom: 16,
  },
  previewLabel: {
    fontSize: '0.78rem',
    fontWeight: 700,
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 6,
  },
  previewText: {
    margin: 0,
    padding: '10px 12px',
    background: '#fff',
    border: '1px solid #bbf7d0',
    borderRadius: 7,
    fontSize: '0.82rem',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontFamily: 'var(--mono, monospace)',
    color: '#1f2937',
    maxHeight: 180,
    overflowY: 'auto',
  },
  buttonRow: {
    display: 'flex',
    gap: 10,
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  },
  cancelBtn: {
    padding: '8px 18px',
    fontSize: '0.875rem',
    background: 'transparent',
    color: '#6b7280',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  sendBtn: {
    padding: '8px 18px',
    fontSize: '0.875rem',
    fontWeight: 600,
    background: '#16a34a',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
};
