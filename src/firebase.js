// Firebase initialization for ScamShield
// Using the modular Firebase JS SDK (tree-shakeable imports)

import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
} from 'firebase/ai';

// ---------------------------------------------------------------------------
// Firebase project config (public — safe to commit)
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
// App Check debug token — only in Vite dev mode.
// Must be set on `self` BEFORE initializeApp is called.
// In production this is never set; a real reCAPTCHA token is used instead.
// ---------------------------------------------------------------------------
if (import.meta.env.DEV) {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN =
    import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN || true;
}

// ---------------------------------------------------------------------------
// Initialize Firebase app
// ---------------------------------------------------------------------------
const app = initializeApp(firebaseConfig);

// ---------------------------------------------------------------------------
// App Check — protects your backend resources from abuse.
// Site key comes from an env variable so the SECRET key is never in source.
// ---------------------------------------------------------------------------
initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider(import.meta.env.VITE_RECAPTCHA_SITE_KEY),
  isTokenAutoRefreshEnabled: true,
});

// ---------------------------------------------------------------------------
// Firebase AI Logic service (Gemini Developer API backend)
// ---------------------------------------------------------------------------
const ai = getAI(app, { backend: new GoogleAIBackend() });

// ---------------------------------------------------------------------------
// On-device model (Gemini Nano running in Chrome via the Prompt API)
//
// HybridParams shape (verified from @firebase/ai type definitions):
//   { mode, onDeviceParams?: { createOptions?: LanguageModelCreateOptions } }
//
// LanguageModelCreateOptions.expectedInputs / expectedOutputs accept an array
// of LanguageModelExpected objects: { type: 'text'|'image'|'audio', languages?: string[] }
// Declaring these explicitly silences Chrome's "No output language specified" warning.
// ---------------------------------------------------------------------------
export const deviceModel = getGenerativeModel(ai, {
  mode: InferenceMode.ONLY_ON_DEVICE,
  onDeviceParams: {
    createOptions: {
      // Tell Chrome's Prompt API what inputs this session will receive
      expectedInputs: [
        { type: 'text', languages: ['en'] },
        { type: 'image' },        // for screenshot scam checks (no language needed)
      ],
      // Tell Chrome's Prompt API what language the output will be in
      expectedOutputs: [
        { type: 'text', languages: ['en'] },
      ],
    },
  },
});

// ---------------------------------------------------------------------------
// Cloud model (Gemini 2.0 Flash via Gemini Developer API)
// Used for the optional "Investigate deeper" feature with Google Search grounding.
// All text sent here must already be masked by maskMessage.js (on-device step).
// ---------------------------------------------------------------------------
export const cloudModel = getGenerativeModel(ai, {
  mode: InferenceMode.ONLY_IN_CLOUD,
  inCloudParams: {
    model: 'gemini-2.0-flash',
  },
});
