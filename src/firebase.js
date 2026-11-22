// Firebase initialisation for ScamShield.
// This file sets up the core Firebase app, App Check, and the AI service.
// It exports `app` and `ai` only — model instances live in src/ai/models.js.

import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAI, GoogleAIBackend } from 'firebase/ai';

// ---------------------------------------------------------------------------
// Firebase project config (public — safe to commit)
// All these values are visible in the browser anyway; they are not secrets.
// ---------------------------------------------------------------------------
const firebaseConfig = {
  apiKey: 'AIzaSyAf02hOS0zaKgADhWdrx1RBpzeYr57g4pk',
  authDomain: 'scamshield-a7d0c.firebaseapp.com',
  projectId: 'scamshield-a7d0c',
  storageBucket: 'scamshield-a7d0c.firebasestorage.app',
  messagingSenderId: '882261842112',
  appId: '1:882261842112:web:f794721afcd71f7e6ef525',
  measurementId: 'G-VYN8HBS1YP',
};

// ---------------------------------------------------------------------------
// App Check debug token — DEV mode only.
//
// In development, App Check can't use reCAPTCHA (no real token is generated
// for localhost). Instead we set a debug token so the SDK accepts our requests.
//
// Two ways this can be set:
//   1. VITE_FIREBASE_APPCHECK_DEBUG_TOKEN in .env.local (a specific token you
//      registered in the Firebase console — preferred, keeps the same token
//      across restarts so you don't need to re-register each time)
//   2. Fallback `true` — the SDK auto-generates a random token and logs it to
//      the console. You then copy it and register it in the Firebase console
//      under App Check → Apps → Manage debug tokens.
//
// MUST be set on `self` BEFORE initializeApp is called.
// Never ships to production — the `if (DEV)` block is tree-shaken by Vite.
// ---------------------------------------------------------------------------
if (import.meta.env.DEV) {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN =
    import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN || true;
}

// ---------------------------------------------------------------------------
// Initialize Firebase app
// ---------------------------------------------------------------------------
export const app = initializeApp(firebaseConfig);

// ---------------------------------------------------------------------------
// App Check — protects Firebase backend resources from unauthorized access.
// Uses reCAPTCHA Enterprise (register your site key in the Firebase console
// under App Check → Apps → reCAPTCHA Enterprise).
// The site key is kept in .env.local (never committed to source control).
// ---------------------------------------------------------------------------
initializeAppCheck(app, {
  provider: new ReCaptchaEnterpriseProvider(
    import.meta.env.VITE_RECAPTCHA_SITE_KEY
  ),
  isTokenAutoRefreshEnabled: true,
});

// ---------------------------------------------------------------------------
// Firebase AI Logic service — Gemini Developer API backend.
// `ai` is passed to getGenerativeModel() in src/ai/models.js to create
// the on-device and cloud model instances.
// ---------------------------------------------------------------------------
export const ai = getAI(app, { backend: new GoogleAIBackend() });
