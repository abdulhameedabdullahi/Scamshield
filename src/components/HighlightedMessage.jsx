// HighlightedMessage — renders text with inline highlights for red-flag phrases.
//
// Props:
//   text       — the full original message string
//   highlights — Array of { start, end, reason, source, phrase }
//                start/end are char positions in `text`; entries where start < 0 are ignored.
//
// Visual design:
//   source === 'rule'  → red background + red underline
//   source === 'ai'    → amber background + amber underline
// Both use underline in addition to colour so the highlight is not colour-only.
// Hover/focus shows the reason via the native `title` attribute.

/**
 * Builds an array of plain and highlighted text segments.
 * Overlapping highlights are resolved first-come (sorted by start position).
 *
 * @param {string} text
 * @param {Array<{start, end, reason, source}>} highlights
 * @returns {Array<{text: string, highlight: object|null}>}
 */
function buildSegments(text, highlights) {
  const valid = highlights
    .filter((h) => h.start >= 0 && h.end > h.start && h.end <= text.length)
    .sort((a, b) => a.start - b.start);

  if (valid.length === 0) return [{ text, highlight: null }];

  // Build a character-level annotation array (first highlight wins for overlaps)
  const ann = new Array(text.length).fill(null);
  for (const h of valid) {
    for (let i = h.start; i < h.end; i++) {
      if (!ann[i]) ann[i] = h;
    }
  }

  // Convert annotation array → contiguous segments
  const segments = [];
  let i = 0;
  while (i < text.length) {
    const h = ann[i];
    let j = i + 1;
    while (j < text.length && ann[j] === h) j++;
    segments.push({ text: text.slice(i, j), highlight: h });
    i = j;
  }
  return segments;
}

function getMarkStyle(source) {
  const isRule = source === 'rule';
  return {
    background: isRule ? '#fee2e2' : '#fef3c7',
    textDecoration: 'underline',
    textDecorationColor: isRule ? '#dc2626' : '#d97706',
    textDecorationThickness: '2px',
    borderRadius: 2,
    cursor: 'help',
    // Reset <mark> browser default yellow background by explicitly setting ours
    padding: '0 1px',
  };
}

export default function HighlightedMessage({ text, highlights }) {
  if (!text) return null;

  const validHighlights = highlights ? highlights.filter((h) => h.start >= 0) : [];

  if (validHighlights.length === 0) {
    return <span style={styles.text}>{text}</span>;
  }

  const segments = buildSegments(text, validHighlights);

  return (
    <span style={styles.text}>
      {segments.map((seg, i) =>
        seg.highlight ? (
          <mark
            key={i}
            style={getMarkStyle(seg.highlight.source)}
            title={seg.highlight.reason || seg.highlight.label || ''}
          >
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </span>
  );
}

const styles = {
  text: {
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontSize: '0.875rem',
    lineHeight: 1.6,
    fontFamily: 'inherit',
  },
};
