// DevTestPanel — developer test UI for verifying hybrid inference is wired up.
// This component is NOT part of the final product UI; it's a diagnostic tool
// used during development to confirm on-device and cloud models work correctly.
//
// It tests the two extremes of the hybrid setup:
//   - onDeviceModel  (ONLY_ON_DEVICE) — will fail if Gemini Nano isn't available
//   - cloudModel     (ONLY_IN_CLOUD)  — will fail if App Check / API key is misconfigured

import { useState, useEffect } from 'react';
import { onDeviceModel, cloudModel } from '../ai/models';
import { getOnDeviceAvailability, initDeviceModel } from '../ai/availability';

export default function DevTestPanel() {
  // Availability status is checked once on mount (no user gesture needed for this)
  const [availability, setAvailability] = useState('checking…');

  const [onDeviceResult, setOnDeviceResult] = useState('');
  const [cloudResult, setCloudResult]       = useState('');
  const [onDeviceBusy, setOnDeviceBusy]     = useState(false);
  const [cloudBusy, setCloudBusy]           = useState(false);
  const [log, setLog] = useState('Ready. Press a button to test.');

  // Check on-device availability as soon as the component mounts.
  // This is a read-only check — no download is triggered here.
  useEffect(() => {
    getOnDeviceAvailability().then(setAvailability);
  }, []);

  function appendLog(msg) {
    setLog(prev => prev + '\n' + msg);
  }

  // -------------------------------------------------------------------------
  // Test on-device inference
  // IMPORTANT: initDeviceModel() MUST be called inside a click handler.
  // Chrome requires a user gesture before it will start downloading the model.
  // -------------------------------------------------------------------------
  async function testOnDevice() {
    setOnDeviceBusy(true);
    setOnDeviceResult('');
    appendLog('[on-device] Initializing model (may download on first run)…');

    try {
      await initDeviceModel(onDeviceModel, (progress) => {
        const pct = Math.round(progress * 100);
        appendLog(`[on-device] Download progress: ${pct}%`);
      });

      appendLog('[on-device] Model ready. Sending prompt…');
      const result = await onDeviceModel.generateContent(
        'Say hello in one short sentence.'
      );
      const text = result.response.text();
      setOnDeviceResult('ON-DEVICE: ' + text);
      appendLog('[on-device] Done.');
    } catch (err) {
      const msg = err?.message ?? String(err);
      setOnDeviceResult('ON-DEVICE ERROR: ' + msg);
      appendLog('[on-device] Error: ' + msg);
      // Log full error details to the console for debugging
      console.error('[ScamShield] On-device test failed:', err);
    } finally {
      setOnDeviceBusy(false);
    }
  }

  // -------------------------------------------------------------------------
  // Test cloud inference
  // -------------------------------------------------------------------------
  async function testCloud() {
    setCloudBusy(true);
    setCloudResult('');
    appendLog('[cloud] Sending prompt to cloud model…');

    try {
      const result = await cloudModel.generateContent(
        'Say hello in one short sentence.'
      );
      const text = result.response.text();
      setCloudResult('CLOUD: ' + text);
      appendLog('[cloud] Done.');
    } catch (err) {
      const msg = err?.message ?? String(err);
      setCloudResult('CLOUD ERROR: ' + msg);
      appendLog('[cloud] Error: ' + msg);
      console.error('[ScamShield] Cloud test failed:', err);
    } finally {
      setCloudBusy(false);
    }
  }

  // Map availability status to a colour for the badge
  const badgeColor = {
    available:    '#166534', // green
    downloadable: '#9a3412', // orange
    downloading:  '#1e40af', // blue
    unavailable:  '#991b1b', // red
    unsupported:  '#4b5563', // grey
    'checking…':  '#4b5563',
  }[availability] ?? '#4b5563';

  return (
    <div style={styles.panel}>
      <h2 style={styles.sectionTitle}>Dev Test Panel</h2>

      {/* Availability badge */}
      <div style={styles.availRow}>
        <span style={styles.availLabel}>On-device AI (Gemini Nano):</span>
        <span style={{ ...styles.availBadge, background: badgeColor }}>
          {availability}
        </span>
      </div>
      <p style={styles.availHint}>
        {availability === 'available'   && 'Gemini Nano is ready on this device.'}
        {availability === 'downloadable'&& 'Model will download on first use (Chrome will start it on button click).'}
        {availability === 'downloading' && 'Model is currently downloading — wait a moment and retry.'}
        {availability === 'unavailable' && 'Device does not meet requirements for Gemini Nano (needs 22 GB free disk + GPU/RAM).'}
        {availability === 'unsupported' && 'Browser does not support the Chrome Prompt API. Use Chrome 139+ on desktop.'}
        {availability === 'checking…'   && 'Checking…'}
      </p>

      {/* Test buttons */}
      <div style={styles.buttonRow}>
        <button
          style={styles.button}
          onClick={testOnDevice}
          disabled={onDeviceBusy}
        >
          {onDeviceBusy ? 'Running…' : 'Test on-device (Gemini Nano)'}
        </button>
        <button
          style={styles.button}
          onClick={testCloud}
          disabled={cloudBusy}
        >
          {cloudBusy ? 'Running…' : 'Test cloud model'}
        </button>
      </div>

      {/* Results */}
      {onDeviceResult && (
        <p style={onDeviceResult.startsWith('ON-DEVICE ERROR') ? styles.error : styles.result}>
          {onDeviceResult}
        </p>
      )}
      {cloudResult && (
        <p style={cloudResult.startsWith('CLOUD ERROR') ? styles.error : styles.result}>
          {cloudResult}
        </p>
      )}

      {/* Log */}
      <pre style={styles.log}>{log}</pre>
    </div>
  );
}

const styles = {
  panel: {
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: 24,
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: '1rem',
    fontWeight: 600,
    marginBottom: 16,
    color: '#374151',
  },
  availRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  availLabel: {
    fontSize: '0.9rem',
    color: '#374151',
  },
  availBadge: {
    fontSize: '0.78rem',
    fontWeight: 600,
    color: '#fff',
    padding: '2px 10px',
    borderRadius: 99,
  },
  availHint: {
    fontSize: '0.82rem',
    color: '#6b7280',
    marginBottom: 20,
    margin: '4px 0 20px',
  },
  buttonRow: {
    display: 'flex',
    gap: 12,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  button: {
    padding: '9px 18px',
    fontSize: '0.9rem',
    cursor: 'pointer',
    background: '#1a73e8',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontFamily: 'inherit',
  },
  result: {
    background: '#f0fdf4',
    border: '1px solid #86efac',
    borderRadius: 6,
    padding: '10px 14px',
    marginBottom: 10,
    wordBreak: 'break-word',
    fontSize: '0.9rem',
  },
  error: {
    background: '#fef2f2',
    border: '1px solid #fca5a5',
    borderRadius: 6,
    padding: '10px 14px',
    marginBottom: 10,
    wordBreak: 'break-word',
    color: '#991b1b',
    fontSize: '0.9rem',
  },
  log: {
    background: '#1f2937',
    color: '#d1fae5',
    border: 'none',
    borderRadius: 6,
    padding: 14,
    fontSize: '0.78rem',
    fontFamily: 'var(--mono, monospace)',
    whiteSpace: 'pre-wrap',
    maxHeight: 260,
    overflowY: 'auto',
    margin: 0,
  },
};
