// ModelStatus — single friendly line (or setup card) below the top bar.
// Only shown when availability is known. Never uses jargon.

export default function ModelStatus({
  availability, isDownloading, downloadProgress, onDownloadRequest,
}) {
  if (!availability) return null;

  if (availability === 'available') {
    return (
      <div style={S.strip} role="status" aria-live="polite">
        <span className="pulse-dot" aria-hidden="true" />
        <span>Private checker ready on this phone ✓</span>
      </div>
    );
  }

  if (availability === 'downloadable') {
    return (
      <div style={S.setupCard}>
        <div style={S.setupText}>
          <strong style={S.setupTitle}>Set up private checking</strong>
          <span style={S.setupHint}> — one-time download, best on Wi-Fi.</span>
          <div style={S.setupDetail}>
            Messages checked privately never leave your phone.
          </div>
        </div>
        <button style={S.setupBtn} onClick={onDownloadRequest} type="button">
          Set up now
        </button>
      </div>
    );
  }

  if (availability === 'downloading' || isDownloading) {
    return (
      <div style={S.setupCard}>
        <div style={{ ...S.setupText, flex: 1 }}>
          <strong style={S.setupTitle}>Downloading private checker…</strong>
          <div style={{ ...S.progressRow, marginTop: 8 }}>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${downloadProgress ?? 0}%` }}
              />
            </div>
            <span style={S.pct}>{downloadProgress ?? 0}%</span>
          </div>
        </div>
      </div>
    );
  }

  if (availability === 'unavailable' || availability === 'unsupported') {
    return (
      <div style={S.strip} role="status">
        <span style={S.grayDot} aria-hidden="true" />
        <span>
          {availability === 'unsupported'
            ? 'Private checking needs Chrome 139+ on a desktop computer.'
            : 'This device cannot check privately.'}{' '}
          You can still check online — personal details are hidden before anything is sent.
        </span>
      </div>
    );
  }

  return null;
}

const S = {
  strip: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 20px',
    background: 'var(--plum-100)',
    borderBottom: '1px solid var(--line)',
    fontSize: '0.875rem',
    color: 'var(--plum-900)',
    flexShrink: 0,
  },
  grayDot: {
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#aaa',
    flexShrink: 0,
  },
  setupCard: {
    display: 'flex',
    gap: 14,
    alignItems: 'flex-start',
    padding: '12px 20px',
    background: 'var(--plum-100)',
    borderBottom: '1px solid var(--line)',
    flexShrink: 0,
  },
  setupText: {
    flex: 1,
    fontSize: '0.9rem',
    color: 'var(--plum-900)',
    lineHeight: 1.5,
  },
  setupTitle: {
    fontFamily: 'var(--font-heading)',
    fontSize: '0.9rem',
    color: 'var(--plum-900)',
  },
  setupHint: {
    fontSize: '0.9rem',
    color: 'var(--plum-700)',
  },
  setupDetail: {
    fontSize: '0.8125rem',
    color: '#555',
    marginTop: 2,
  },
  setupBtn: {
    padding: '7px 16px',
    fontSize: '0.875rem',
    fontWeight: 700,
    background: 'var(--plum-700)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--r-btn)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    flexShrink: 0,
    whiteSpace: 'nowrap',
    minHeight: 44,
  },
  progressRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  pct: {
    fontSize: '0.8125rem',
    color: 'var(--plum-700)',
    minWidth: 32,
    textAlign: 'right',
    fontWeight: 600,
  },
};
