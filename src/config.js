// App-wide constants for ScamShield.
// Centralising the cloud model name here means you only change it in one place.

export const APP_NAME = 'ScamShield';

// IMPORTANT: Verify this model name in the Firebase AI Logic docs before shipping.
// Supported models: https://firebase.google.com/docs/ai-logic/models
// Confirmed working model name as of Nov 2026 (gemini-2.0-flash-lite was retired).
export const CLOUD_MODEL = 'gemini-3.5-flash-lite';
