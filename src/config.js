// App-wide constants for ScamShield.
// Centralising the cloud model name here means you only change it in one place.

export const APP_NAME = 'ScamShield';

// IMPORTANT: Verify this model name in the Firebase AI Logic docs before shipping.
// Supported models: https://firebase.google.com/docs/ai-logic/models
// Confirmed working model name as of Nov 2026 (gemini-2.0-flash-lite was retired).
export const CLOUD_MODEL = 'gemini-3.5-flash-lite';

// Static reporting tips shown for scam/suspicious verdicts.
// These are general-purpose and safe to show without AI generating them.
// TODO: add official Nigerian reporting URLs (EFCC, CBN, NITDA) once verified — no links hard-coded yet.
export const REPORTING_TIPS = [
  "Don't reply, click any links, or send money.",
  'Contact your bank through its official app or the number on the back of your card.',
  'Block and report the sender in your messaging app.',
  'Report fraud to the relevant authorities through their official websites.',
];
