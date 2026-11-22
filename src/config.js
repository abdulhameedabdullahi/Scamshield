// App-wide constants for ScamShield.
// Centralising the cloud model name here means you only change it in one place.

export const APP_NAME = 'ScamShield';

// IMPORTANT: Verify this model name in the Firebase AI Logic docs before shipping.
// Supported models: https://firebase.google.com/docs/ai-logic/models
// Update to 'gemini-2.0-flash' or the latest recommended lite model as needed.
export const CLOUD_MODEL = 'gemini-2.0-flash-lite';
