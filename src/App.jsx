import { useState } from 'react';
import { deviceModel, cloudModel } from './firebase';

export default function App() {
  const [log, setLog] = useState('Ready. Press a button to test.');
  const [onDeviceResult, setOnDeviceResult] = useState('');
  const [cloudResult, setCloudResult] = useState('');
  const [onDeviceBusy, setOnDeviceBusy] = useState(false);
  const [cloudBusy, setCloudBusy] = useState(false);

  function appendLog(msg) {
    setLog(prev => prev + '\n' + msg);
  }

  // -------------------------------------------------------------------------
  // On-device test — must be triggered by a user gesture (button click).
  // initializeDeviceModel() may trigger a Gemini Nano download the first time.
  // -------------------------------------------------------------------------
  async function testOnDevice() {
    setOnDeviceBusy(true);
    setOnDeviceResult('');
    appendLog('[on-device] Initializing model (may download on first run)…');

    try {
      // progressValue is 0–1; Chrome may also call back several times at 1.0
      await deviceModel.initializeDeviceModel((progressValue) => {
        const pct = Math.round(progressValue * 100);
        appendLog(`[on-device] Download progress: ${pct}%`);
      });

      appendLog('[on-device] Model ready. Sending prompt…');
      const result = await deviceModel.generateContent(
        'Say hello in one short sentence.'
      );
      const text = result.response.text();
      setOnDeviceResult('ON-DEVICE: ' + text);
      appendLog('[on-device] Done.');
    } catch (err) {
      const msg = err?.message ?? String(err);
      setOnDeviceResult('ON-DEVICE ERROR: ' + msg);
      appendLog('[on-device] Error: ' + msg);
    } finally {
      setOnDeviceBusy(false);
    }
  }

  // -------------------------------------------------------------------------
  // Cloud test — calls Gemini 2.0 Flash via the Gemini Developer API.
  // -------------------------------------------------------------------------
  async function testCloud() {
    setCloudBusy(true);
    setCloudResult('');
    appendLog('[cloud] Sending prompt to Gemini 2.0 Flash…');

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
    } finally {
      setCloudBusy(false);
    }
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>ScamShield — Firebase AI Hello World</h1>
      <p style={styles.subtitle}>
        Tests hybrid inference: Gemini Nano on-device + Gemini 2.0 Flash in cloud.
      </p>

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
          {cloudBusy ? 'Running…' : 'Test cloud (Gemini 2.0 Flash)'}
        </button>
      </div>

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

      <pre style={styles.log}>{log}</pre>
    </div>
  );
}

const styles = {
  container: {
    fontFamily: 'system-ui, sans-serif',
    maxWidth: 700,
    margin: '40px auto',
    padding: '0 20px',
    color: '#1a1a1a',
  },
  title: {
    fontSize: '1.5rem',
    marginBottom: 4,
  },
  subtitle: {
    color: '#555',
    marginBottom: 24,
  },
  buttonRow: {
    display: 'flex',
    gap: 12,
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  button: {
    padding: '10px 20px',
    fontSize: '0.95rem',
    cursor: 'pointer',
    background: '#1a73e8',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
  },
  result: {
    background: '#e8f5e9',
    border: '1px solid #a5d6a7',
    borderRadius: 6,
    padding: '10px 14px',
    marginBottom: 12,
    wordBreak: 'break-word',
  },
  error: {
    background: '#ffebee',
    border: '1px solid #ef9a9a',
    borderRadius: 6,
    padding: '10px 14px',
    marginBottom: 12,
    wordBreak: 'break-word',
    color: '#c62828',
  },
  log: {
    background: '#f5f5f5',
    border: '1px solid #ddd',
    borderRadius: 6,
    padding: 14,
    fontSize: '0.82rem',
    whiteSpace: 'pre-wrap',
    maxHeight: 300,
    overflowY: 'auto',
  },
};
