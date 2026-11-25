// SendPreview — "Before we search online" masking review sheet.
//
// Props: originalText, entities, regexOnly, onSend, onCancel

import { useState, useMemo } from 'react';
import { buildMaskedText } from '../ai/maskMessage';
import { MASK_POLICY, MASK_POLICY_LABELS, PLACEHOLDER_TYPES } from '../config';

export default function SendPreview({ originalText, entities, regexOnly, onSend, onCancel, subtitle }) {
  const [overrides, setOverrides] = useState({});

  const actions = useMemo(
    () => entities.map((e, i) =>
      overrides[i] ?? e.defaultAction ?? (MASK_POLICY[e.type] === 'mask' ? 'mask' : 'keep')
    ),
    [entities, overrides],
  );

  const { maskedText, entityPlaceholders } = useMemo(
    () => buildMaskedText(originalText, entities, overrides),
    [originalText, entities, overrides],
  );

  const hiddenItems  = entities.filter((_, i) => actions[i] === 'mask');
  const keptItems    = entities.filter((_, i) => actions[i] === 'keep');

  function toggle(idx) {
    setOverrides((prev) => ({ ...prev, [idx]: actions[idx] === 'mask' ? 'keep' : 'mask' }));
  }

  return (
    <div style={S.wrap} className="bubble-enter" role="dialog" aria-label="Before we search online">
      {/* Title */}
      <div style={S.titleRow}>
        <span style={S.lockIcon} aria-hidden="true">🔒</span>
        <div>
          <h2 style={S.title}>Before we search online</h2>
          {subtitle && <p style={S.subtitle}>{subtitle}</p>}
          {regexOnly && (
            <p style={S.regexNote}>Basic hiding only — private AI unavailable on this phone.</p>
          )}
        </div>
      </div>

      {/* Hidden items summary */}
      {hiddenItems.length > 0 && (
        <div style={S.section}>
          <div style={S.sectionLabel}>We hid your personal details:</div>
          <div style={S.chipRow}>
            {entities.map((e, i) => {
              if (actions[i] !== 'mask') return null;
              const ph = entityPlaceholders[i] ?? `[${PLACEHOLDER_TYPES[e.type] ?? 'ITEM'}]`;
              return (
                <button
                  key={i}
                  type="button"
                  style={S.chipHidden}
                  onClick={() => toggle(i)}
                  title="Tap to un-hide"
                  aria-label={`${ph} hidden. Tap to send original.`}
                >
                  <span style={S.chipStrike}>{e.text}</span>
                  <span style={S.chipPh}>{ph}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Kept items */}
      {keptItems.length > 0 && (
        <div style={S.section}>
          <div style={S.sectionLabel}>We kept these so we can check them:</div>
          <div style={S.chipRow}>
            {entities.map((e, i) => {
              if (actions[i] !== 'keep') return null;
              const keepLabel = MASK_POLICY_LABELS[e.type] ?? 'evidence';
              return (
                <button
                  key={i}
                  type="button"
                  style={S.chipKept}
                  onClick={() => toggle(i)}
                  title={`Tap to hide — ${keepLabel}`}
                  aria-label={`${e.text} kept as ${keepLabel}. Tap to hide.`}
                >
                  {e.text}
                  <span style={S.chipKeptTag}> {keepLabel}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {entities.length === 0 && (
        <p style={S.noEntities}>No personal details found. The message will be sent as-is.</p>
      )}

      {/* Final masked text preview */}
      <div style={S.section}>
        <div style={S.sectionLabel}>This exact text will be searched:</div>
        <pre style={S.preview}>{maskedText}</pre>
      </div>

      {/* Buttons */}
      <div style={S.btnRow}>
        <button className="btn-ghost" onClick={onCancel} type="button">
          Cancel
        </button>
        <button className="btn-deeper" style={{ width: 'auto', marginBottom: 0 }} onClick={() => onSend(maskedText)} type="button">
          Search online
        </button>
      </div>
    </div>
  );
}


const S = {
  wrap: {
    background: 'var(--plum-100)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--r-bubble-in)',
    padding: '20px',
    maxWidth: '96%',
  },
  titleRow: {
    display: 'flex',
    gap: 12,
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  lockIcon: {
    fontSize: '1.4rem',
    flexShrink: 0,
    lineHeight: 1.3,
  },
  title: {
    fontSize: '1.0625rem',
    margin: 0,
    color: 'var(--plum-900)',
  },
  subtitle: {
    fontSize: '0.9rem',
    color: 'var(--plum-900)',
    lineHeight: 1.5,
    marginTop: 4,
  },
  regexNote: {
    fontSize: '0.8125rem',
    color: '#888',
    marginTop: 3,
  },
  section: {
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: '0.875rem',
    fontWeight: 700,
    color: 'var(--ink)',
    marginBottom: 8,
  },
  chipRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  chipHidden: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 10px',
    background: 'var(--scam-bg)',
    color: 'var(--scam)',
    border: '1px solid #FECACA',
    borderRadius: 'var(--r-chip)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '0.875rem',
    minHeight: 36,
  },
  chipStrike: {
    textDecoration: 'line-through',
    opacity: 0.5,
    fontSize: '0.8em',
  },
  chipPh: {
    fontWeight: 700,
    fontSize: '0.875rem',
  },
  chipKept: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 2,
    padding: '4px 10px',
    background: '#EBF5FF',
    color: '#1E40AF',
    border: '1px solid #BFDBFE',
    borderRadius: 'var(--r-chip)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '0.875rem',
    minHeight: 36,
  },
  chipKeptTag: {
    fontSize: '0.75rem',
    opacity: 0.7,
  },
  noEntities: {
    fontSize: '0.9375rem',
    color: '#555',
    marginBottom: 14,
  },
  preview: {
    margin: 0,
    padding: '12px 14px',
    background: '#fff',
    border: '1px solid var(--line)',
    borderRadius: 10,
    fontSize: '0.875rem',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontFamily: 'var(--font-mono)',
    color: 'var(--ink)',
    maxHeight: 160,
    overflowY: 'auto',
  },
  btnRow: {
    display: 'flex',
    gap: 10,
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  },
};
