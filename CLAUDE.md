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

| Step | Where | How | Notes |
|------|-------|-----|-------|
| 1. Quick scam check | On-device (Gemini Nano, Chrome) | `ONLY_ON_DEVICE` | Returns structured JSON: `{ verdict, confidence, redFlags, advice }` |
| 2. Mask personal details | On-device ONLY | `ONLY_ON_DEVICE` | Names, account numbers, phone numbers, emails. **Must NEVER fall back to cloud.** |
| 3. "Investigate deeper" | Cloud | `ONLY_IN_CLOUD` + Google Search grounding | Multi-turn chat. Uses masked text only. |

---

## Firebase products used

- **Firebase AI Logic** — hybrid inference (Gemini Nano + Gemini 2.0 Flash)
- **Firestore** — anonymous masked community reports
- **Anonymous Auth** — user identity for reports
- **Remote Config** — `scam_trends` string injected into prompts
- **App Check** (reCAPTCHA v3) — required, protects backend

---

## Firebase project

- **Project ID:** `scamshield-a7d0c`
- **Provider:** Gemini Developer API (`GoogleAIBackend`)
- **firebase version:** `12.19.0` — do NOT upgrade or downgrade (a newer version failed to install)

---

## Rules for this codebase

1. **Never commit secrets:** reCAPTCHA SECRET key, App Check debug tokens, `.env.local` values.
   The Firebase web config (API key, project ID, etc.) is public and fine to commit.
2. Use the **modular Firebase JS SDK** (imports from `"firebase/app"`, `"firebase/app-check"`, `"firebase/ai"`).
3. Keep code **simple and commented** — the developer is learning these APIs.
4. **Don't add extra libraries** unless explicitly asked.
5. The masking step (`src/ai/maskMessage.js`) must be `ONLY_ON_DEVICE` — no cloud fallback, ever.
6. App Check must be initialized before any Firebase service that requires it.

---

## Planned folder structure

```
src/
  firebase.js          ← Firebase init, App Check, AI service, deviceModel, cloudModel
  ai/
    checkMessage.js    ← On-device scam check (ONLY_ON_DEVICE), returns structured JSON
    maskMessage.js     ← On-device PII masking (ONLY_ON_DEVICE, never falls back to cloud)
    investigate.js     ← Cloud investigation with Google Search grounding (ONLY_IN_CLOUD)
  reports.js           ← Firestore: write/read anonymous masked community reports
  components/          ← React UI components
```

---

## Key API patterns

### On-device model (src/firebase.js)
```js
// HybridParams for ONLY_ON_DEVICE:
getGenerativeModel(ai, {
  mode: InferenceMode.ONLY_ON_DEVICE,
  onDeviceParams: {
    createOptions: {
      expectedInputs: [
        { type: 'text', languages: ['en'] },
        { type: 'image' },
      ],
      expectedOutputs: [
        { type: 'text', languages: ['en'] },
      ],
    },
  },
});
```

### initializeDeviceModel (must be called on user gesture)
```js
await deviceModel.initializeDeviceModel((progressValue) => {
  console.log(`Download: ${Math.round(progressValue * 100)}%`);
});
```

### Cloud model (src/firebase.js)
```js
getGenerativeModel(ai, {
  mode: InferenceMode.ONLY_IN_CLOUD,
  inCloudParams: { model: 'gemini-2.0-flash' },
});
```

---

## Environment variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `VITE_RECAPTCHA_SITE_KEY` | `.env.local` | reCAPTCHA v3 **site key** (public, but keep out of source) |

`.env.local` is gitignored. See `.env.example` for the template.

---

## Dev mode App Check

In `import.meta.env.DEV`, `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` is set before App Check init.
This causes the SDK to log a debug token to the browser console.
Register that token in the Firebase console under **App Check → Apps → Manage debug tokens**.
