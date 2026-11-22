# ScamShield — CLAUDE.md

Project context for AI-assisted development. Keep this file updated as the project evolves.

---

## Project overview

ScamShield is a web app (Chrome desktop) for the Firebase #BuildHybridAI hackathon (Devpost).  
Deadline: **Nov 30, 2026, 11:00 PM Lagos time (2:00 PM PT)**.  
Solo developer on Windows.

It checks suspicious messages (SMS, WhatsApp, email: fake bank alerts, BVN/NIN scams, job scams, etc.)
using Firebase AI Logic **hybrid inference**.

---

## Hybrid inference architecture

| Step | Where | Inference mode | Notes |
|------|-------|---------------|-------|
| 1. Quick scam check | On-device (Gemini Nano) | `PREFER_ON_DEVICE` | Returns structured JSON: `{ verdict, confidence, redFlags, advice }`. Falls back to cloud if Nano unavailable. |
| 2. Mask personal details | On-device ONLY + regex | `ONLY_ON_DEVICE` | Names, account numbers, phone, emails, BVN/NIN. **Must NEVER fall back to cloud.** |
| 3. "Investigate deeper" | Cloud | `ONLY_IN_CLOUD` + Google Search grounding | Multi-turn chat. Uses masked text only. |
| 4. Non-English messages | Cloud | `ONLY_IN_CLOUD` | Nano officially supports en/es/ja/de/fr only |
| 5. No-Nano devices | Regex mask + explicit consent | `ONLY_IN_CLOUD` | Graceful degradation |

---

## Firebase products used

- **Firebase AI Logic** — hybrid inference (Gemini Nano + Gemini cloud)
- **App Check** — reCAPTCHA Enterprise; debug token for localhost
- **Firestore** — anonymous masked community reports (🚧 not yet built)
- **Anonymous Auth** — user identity for Firestore (🚧)
- **Remote Config** — `scam_trends` string injected into prompts (🚧)
- **Firebase Hosting** — production deployment (🚧)

---

## Firebase project

- **Project ID:** `scamshield-a7d0c`
- **Provider:** Gemini Developer API (`GoogleAIBackend`)
- **firebase version:** `12.19.0` — do NOT upgrade or downgrade (a newer version failed to install)
- **App Check provider:** `ReCaptchaEnterpriseProvider` (changed from v3 in session 2)
  - Requires a reCAPTCHA Enterprise key registered in Firebase console under App Check

---

## Rules for this codebase

1. **Never commit secrets:** reCAPTCHA SECRET key, App Check debug tokens, `.env.local` values.
   The Firebase web config (apiKey, projectId, etc.) is public and fine in source.
2. Use the **modular Firebase JS SDK** (imports from `"firebase/app"`, `"firebase/app-check"`, `"firebase/ai"`).
3. Keep code **simple and commented** — the developer is learning these APIs.
4. **Don't add extra libraries** unless explicitly asked.
5. `maskMessage.js` MUST use `ONLY_ON_DEVICE` — no cloud fallback, ever.
6. App Check must be initialized before any Firebase service that requires it.
7. `CLOUD_MODEL` constant lives in `src/config.js` — never hardcode model names elsewhere.

---

## Folder structure (current)

```
src/
  firebase.js          ← Firebase app init + App Check + getAI → exports app, ai
  config.js            ← CLOUD_MODEL, APP_NAME constants
  ai/
    models.js          ← Creates & exports: onDeviceModel, preferOnDeviceModel, cloudModel
    availability.js    ← getOnDeviceAvailability(), initDeviceModel() helpers
    prompts.js         ← Placeholder prompt constants (TODO)
    schemas.js         ← Placeholder JSON schema (TODO)
    checkMessage.js    ← Stub: checkMessage(text) — PREFER_ON_DEVICE (TODO)
    maskMessage.js     ← Stub + regexMask() — ONLY_ON_DEVICE (TODO for AI masking)
    investigate.js     ← Stub: investigate(maskedText) — ONLY_IN_CLOUD (TODO)
  services/
    reports.js         ← Stub: Firestore community reports (TODO)
  components/
    DevTestPanel.jsx   ← Dev test UI: availability status + on-device/cloud buttons
  App.jsx              ← Root: "ScamShield" header + DevTestPanel
  main.jsx             ← Vite entry point (unchanged from template)
  index.css            ← Global styles (cleaned up from Vite template)
```

---

## Key API patterns

### On-device params (verified against @firebase/ai type definitions)
```js
// LanguageModelCreateOptions.expectedInputs/expectedOutputs:
//   Array of { type: 'text'|'image'|'audio', languages?: string[] }
const ON_DEVICE_PARAMS = {
  createOptions: {
    expectedInputs: [
      { type: 'text', languages: ['en'] },
      { type: 'image' },        // screenshots — no language needed
    ],
    expectedOutputs: [
      { type: 'text', languages: ['en'] },
    ],
  },
};
```

### Three model instances (src/ai/models.js)
```js
// ONLY_ON_DEVICE — strict, for PII masking
export const onDeviceModel = getGenerativeModel(ai, {
  mode: InferenceMode.ONLY_ON_DEVICE,
  onDeviceParams: ON_DEVICE_PARAMS,
});

// PREFER_ON_DEVICE — tries Nano first, falls back to cloud
export const preferOnDeviceModel = getGenerativeModel(ai, {
  mode: InferenceMode.PREFER_ON_DEVICE,
  onDeviceParams: ON_DEVICE_PARAMS,
  inCloudParams: { model: CLOUD_MODEL },
});

// ONLY_IN_CLOUD — investigation + chat
export const cloudModel = getGenerativeModel(ai, {
  mode: InferenceMode.ONLY_IN_CLOUD,
  inCloudParams: { model: CLOUD_MODEL },
});
```

### initializeDeviceModel (must be called on user gesture)
```js
// From availability.js:
await initDeviceModel(onDeviceModel, (progress) => {
  console.log(`Download: ${Math.round(progress * 100)}%`);
});
```

### On-device availability check (safe to call without user gesture)
```js
// From availability.js:
const status = await getOnDeviceAvailability();
// Returns: 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'unsupported'
```

---

## Environment variables

| Variable | File | Purpose |
|----------|------|---------|
| `VITE_RECAPTCHA_SITE_KEY` | `.env.local` | reCAPTCHA Enterprise **site key** (public, but keep out of source) |
| `VITE_FIREBASE_APPCHECK_DEBUG_TOKEN` | `.env.local` | App Check debug UUID for localhost (secret — keep out of source) |

`.env.local` is gitignored. See `.env.example` for the template.

---

## Dev mode App Check flow

1. In `import.meta.env.DEV`, `self.FIREBASE_APPCHECK_DEBUG_TOKEN` is set before `initializeApp`.
2. If `VITE_FIREBASE_APPCHECK_DEBUG_TOKEN` is set in `.env.local`, that specific token is used (stable).
3. If it's blank, the SDK auto-generates a random token and logs it to the browser console.
4. Register the token in Firebase console: **App Check → Apps → Manage debug tokens → Add**.
5. Add the token to `.env.local` so it stays stable across dev server restarts.

---

## Decisions made in session 2

- Switched from `ReCaptchaV3Provider` to `ReCaptchaEnterpriseProvider` (matches Firebase console setup).
- Moved model creation to `src/ai/models.js`; `firebase.js` now only exports `app` and `ai`.
- Added `preferOnDeviceModel` (PREFER_ON_DEVICE) for the scam check — the previous `deviceModel` was ONLY_ON_DEVICE which would error if Nano was unavailable.
- `CLOUD_MODEL` constant in `src/config.js`; default is `'gemini-2.0-flash-lite'` (verify model name in Firebase AI Logic docs before shipping).
- Added `regexMask()` as a PII safety net in `maskMessage.js` — currently the only masking in use until the AI masking prompt is written.
