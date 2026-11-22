// ModelStatus — shows on-device AI availability and lets the user pre-download
// the model before they have a message to check.

export default function ModelStatus({ availability, isDownloading, downloadProgress, onDownloadRequest }) {
  if (availability === 'available') {
    return (
      <div style={{ ...styles.banner, ...styles.bannerGreen }}>
        <span style={styles.icon}>&#9679;</span>
        <span>Private AI ready — this check runs entirely on your device.</span>
      </div>
    );
  }

  if (availability === 'downloadable' || availability === 'downloading' || isDownloading) {
    return (
      <div style={{ ...styles.banner, ...styles.bannerBlue }}>
        <div style={styles.downloadRow}>
          <div>
            <div style={styles.downloadTitle}>Private AI model available (one-time download)</div>
            <div style={styles.downloadHint}>
              Download Gemini Nano to keep your messages private — nothing leaves your device.
            </div>
          </div>
          {!isDownloading && (
            <button style={styles.dlButton} onClick={onDownloadRequest}>
              Download model
            </button>
          )}
        </div>
        {isDownloading && (
          <div style={styles.progressWrap}>
            <div style={styles.progressTrack}>
              <div style={{ ...styles.progressFill, width: `${downloadProgress ?? 0}%` }} />
            </div>
            <span style={styles.progressLabel}>{downloadProgress ?? 0}%</span>
          </div>
        )}
      </div>
    );
  }

  if (availability === 'unavailable' || availability === 'unsupported') {
    return (
      <div style={{ ...styles.banner, ...styles.bannerGrey }}>
        <span style={styles.icon}>&#9675;</span>
        <span>
          {availability === 'unsupported'
            ? 'On-device AI is not supported on this browser. Use Chrome 139+ on desktop to enable private checking.'
            : 'On-device AI is not available on this device (requires 22 GB free disk + capable GPU/RAM).'}
          {' '}Messages will be anonymised before any cloud check.
        </span>
      </div>
    );
  }

  // 'checking...' or unknown
  return (
    <div style={{ ...styles.banner, ...styles.bannerGrey }}>
      <span style={styles.icon}>&#8230;</span>
      <span>Checking AI availability…</span>
    </div>
  );
}

const styles = {
  banner: {
    borderRadius: 8,
    padding: '12px 16px',
    fontSize: '0.875rem',
    marginBottom: 16,
    lineHeight: 1.5,
  },
  bannerGreen: {
    background: '#f0fdf4',
    border: '1px solid #bbf7d0',
    color: '#166534',
  },
  bannerBlue: {
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
    color: '#1e3a8a',
  },
  bannerGrey: {
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    color: '#6b7280',
  },
  icon: {
    marginRight: 8,
  },
  downloadRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  downloadTitle: {
    fontWeight: 600,
    marginBottom: 2,
  },
  downloadHint: {
    color: '#3b82f6',
    fontSize: '0.82rem',
  },
  dlButton: {
    flexShrink: 0,
    padding: '7px 16px',
    fontSize: '0.875rem',
    background: '#1d4ed8',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },
  progressWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    background: '#bfdbfe',
    borderRadius: 99,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: '#1d4ed8',
    borderRadius: 99,
    transition: 'width 0.3s ease',
  },
  progressLabel: {
    fontSize: '0.82rem',
    minWidth: 36,
    textAlign: 'right',
  },
};
