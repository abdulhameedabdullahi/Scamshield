// get_scam_trends tool — reads the 'scam_trends' string from Firebase Remote Config.
//
// Falls back to SCAM_TRENDS_DEFAULT from config.js if Remote Config is unavailable.
// Remote Config is initialized in firebase.js with a 1-hour fetch interval in
// production (60 seconds in dev).

import { fetchAndActivate, getString } from 'firebase/remote-config';
import { remoteConfig } from '../../firebase';
import { SCAM_TRENDS_DEFAULT } from '../../config';

// ── Function declaration for Firebase AI ──────────────────────────────────

export const declaration = {
  name: 'get_scam_trends',
  description:
    'Fetch the latest scam trend intelligence configured for this region. ' +
    'Useful for context about what types of scams are currently active.',
  parameters: {
    type: 'object',
    properties: {},
    // No required parameters — this tool takes no arguments
  },
};

// ── Execute ────────────────────────────────────────────────────────────────

export async function execute() {
  try {
    await fetchAndActivate(remoteConfig);
    const trends = getString(remoteConfig, 'scam_trends');
    return { trends: trends || SCAM_TRENDS_DEFAULT, source: trends ? 'remote_config' : 'default' };
  } catch (err) {
    console.warn('[ScamShield] Remote Config unavailable, using default:', err?.message);
    return { trends: SCAM_TRENDS_DEFAULT, source: 'default' };
  }
}
