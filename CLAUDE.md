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
| 1. Quick scam check | On-device (Gemini Nano) | `ONLY_ON_DEVICE` | Explicit routing — user is always told where their text goes. Returns structured JSON: `{ verdict, confidence, category, redFlags, summary, advice }`. |
| 2. Cloud scam check (consent-gated) | Cloud | `ONLY_IN_CLOUD` | Only after user consent. regexMask() runs first — raw PII never leaves device. |
| 3. Mask personal details | On-device ONLY + regex | `ONLY_ON_DEVICE` | Names, account numbers, phone, emails, BVN/NIN. **Must NEVER fall back to cloud.** |
| 4. "Investigate deeper" | Cloud | `ONLY_IN_CLOUD` + Google Search grounding | Multi-turn chat. Uses masked text only. (🚧 not yet built) |
| 5. No-Nano devices | Regex mask + explicit consent | `ONLY_IN_CLOUD` | Graceful degradation |

**WHY `PREFER_ON_DEVICE` WAS REMOVED (session 3):**
`PREFER_ON_DEVICE` silently falls back to cloud when Gemini Nano is unavailable, sending raw
(unmasked) text to the cloud without the user's knowledge. This breaks the app's privacy promise.
`checkMessage.js` now implements explicit routing: it checks `LanguageModel.availability()` and
either runs on-device, prompts the user to download the model, or shows a consent dialog before
any cloud call. The user always knows where their text goes.

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

- **Project ID:** `scamshield-9b81e`
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
  firebase.js           ← Firebase app init + App Check + getAI → exports app, ai
  config.js             ← CLOUD_MODEL, APP_NAME constants
  ai/
    models.js           ← Creates & exports: onDeviceModel, cloudModel (2 models only — no PREFER_ON_DEVICE)
    availability.js     ← getOnDeviceAvailability(), initDeviceModel() helpers
    regexMask.js        ← Standalone PII regex masker: regexMask(text) — no AI, runs synchronously
    maskMessage.js      ← maskMessage(text) — imports from regexMask.js; NEVER falls back to cloud
    prompts.js          ← buildScamCheckPrompt(messageText, scamTrends?) — single-string prompt builder
    schemas.js          ← SCAM_RESULT_SCHEMA (Schema.object), SCAM_CHECK_GENERATION_CONFIG
    checkMessage.js     ← Explicit routing: checkMessage(), onDeviceCheck(), cloudCheck(),
                           downloadAndCheck(), preloadDeviceModel(), parseCheckResult()
    investigate.js      ← Stub: investigate(maskedText) — ONLY_IN_CLOUD (TODO)
  services/
    reports.js          ← Stub: Firestore community reports (TODO)
  components/
    ModelStatus.jsx     ← On-device availability banner + pre-download button with progress bar
    MessageInput.jsx    ← Textarea, Check button, Clear button, char counter (2000 max)
    VerdictCard.jsx     ← Colour-coded result card (red/amber/green), source badge, masked preview
    ConsentDialog.jsx   ← Inline consent UI for the cloud check path
    DevTestPanel.jsx    ← Dev test UI: availability status + on-device/cloud hello-world buttons
  dev/
    testMessages.js     ← 14 synthetic test messages (9 scams, 5 legit) with expected verdicts
    TestRunner.jsx      ← Batch test runner table: expected vs actual, accuracy %, timing
  App.jsx               ← Full app UI; DevTestPanel + TestRunner behind "Developer tools" toggle
  main.jsx              ← Vite entry point (unchanged from template)
  index.css             ← Global styles (cleaned up from Vite template)
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

### Two model instances (src/ai/models.js)
`preferOnDeviceModel` was removed in session 3. See routing design above.

```js
// ONLY_ON_DEVICE — for scam check (on-device path) and PII masking
export const onDeviceModel = getGenerativeModel(ai, {
  mode: InferenceMode.ONLY_ON_DEVICE,
  onDeviceParams: ON_DEVICE_PARAMS,
});

// ONLY_IN_CLOUD — for the consent-gated cloud scam check and future deep investigation
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
- `CLOUD_MODEL` constant in `src/config.js`; currently `'gemini-3.5-flash-lite'` (confirmed working Nov 2026; `gemini-2.0-flash-lite` was retired).
- Added `regexMask()` as a PII safety net in `maskMessage.js` — currently the only masking in use until the AI masking prompt is written.

---

## Decisions made in session 3

- **Removed `preferOnDeviceModel`** — PREFER_ON_DEVICE silently exposes raw text to the cloud when Nano is unavailable. Replaced with explicit routing in `checkMessage.js` that returns `{ state: 'needs_download' }` or `{ state: 'needs_consent' }` to let the UI handle both cases with the user's knowledge. See routing design above.
- **Extracted `regexMask.js`** — moved the PII regex from `maskMessage.js` into its own file so it can be imported by `checkMessage.js` (for the cloud path) independently of the AI masking module.
- **Structured output schema** — `SCAM_RESULT_SCHEMA` uses `Schema.object/enumString/array/string` from `firebase/ai`. On-device: the Firebase SDK bridges `generationConfig.responseSchema` → Chrome's `responseConstraint`. Cloud: standard Gemini structured output.
- **Verdict schema fields**: `verdict` (scam/suspicious/safe), `confidence` (low/medium/high), `category` (12 enum values), `redFlags` (array ≤3), `summary` (string), `advice` (string).
- **Full scam check UI** — `ModelStatus`, `MessageInput`, `VerdictCard`, `ConsentDialog` components. `DevTestPanel` + `TestRunner` moved behind "Developer tools" collapsible toggle.
- **Developer test harness** — 14 synthetic test messages (9 scam categories + 5 legit) in `dev/testMessages.js`; `TestRunner.jsx` runs them through `onDeviceCheck()` and shows accuracy %.
- **`preloadDeviceModel(onProgress)`** exported from `checkMessage.js` — lets the ModelStatus "Download model" button pre-download without requiring a pending message.

### Structured output call signature (verified against @firebase/ai types)
```js
const response = await model.generateContent({
  contents: [{ role: 'user', parts: [{ text: prompt }] }],
  generationConfig: {
    responseMimeType: 'application/json',
    responseSchema: SCAM_RESULT_SCHEMA,  // Schema instance from Schema.object(...)
  },
});
const json = response.response.text();  // Always a JSON string when responseMimeType is set
```

### Routing return values from checkMessage(text, onChunk?)
```js
// On-device path (availability === 'available')
{ verdict, confidence, category, redFlags, summary, advice, source: 'on-device', durationMs }

// Needs download (availability === 'downloadable' | 'downloading')
{ state: 'needs_download', availability }

// Needs consent (availability === 'unavailable' | 'unsupported')
{ state: 'needs_consent', availability }

// Cloud path after consent (from cloudCheck())
{ verdict, confidence, category, redFlags, summary, advice, source: 'cloud', maskedText, durationMs }
```

---

## Decisions made in session 4 (bug fixes + speed)

- **Issue 1 — category contradicts verdict**: `parseCheckResult` now forces `category = 'none'` and `redFlags = []` when `verdict === 'safe'`. VerdictCard shows "Legitimate message" for safe results and "Other suspicious message" when scam/suspicious with `category === 'none'`.
- **Issue 2 — no org-specific advice**: Prompt updated to explicitly prohibit naming organisations or stating their policies. advice must use only general guidance like "Contact your bank using the number on the back of your card".
- **Issue 3 — static reporting tips**: Removed reporting instructions from AI advice entirely. Added `REPORTING_TIPS` array to `src/config.js`. VerdictCard renders a static "What you can do" section (only for scam/suspicious) from this constant. No phone numbers or URLs hard-coded — TODO comment marks where official Nigerian agency links will be added once verified.
- **Issue 4 — speed improvements**:
  - Prompt trimmed ~37% (350 words → 220 words) — faster prefill.
  - `redFlags` capped at 3 in schema (`maxItems: 3`) and prompt — less output to generate.
  - Both `onDeviceCheck` and `cloudCheck` switched from `generateContent` to `generateContentStream` — UI shows live char count and elapsed seconds while generating.
  - `warmUpDeviceModel()` added to `checkMessage.js` — fires from `useEffect` in App.jsx when `availability === 'available'` (no gesture needed since no download is triggered); creates the Chrome session early so the first real check is not cold-started. Expected to cut first-check time by 5-10 s.
  - Live elapsed counter (`0.1s` ticks) shown while checking in App.jsx.
  - TestRunner now has a warm-up step and reports warm-up time + first-run time + average of runs 2-14 separately.

### Streaming call signature (verified against @firebase/ai types)
```js
// GenerativeModel.generateContentStream returns Promise<GenerateContentStreamResult>
// GenerateContentStreamResult: { stream: AsyncGenerator<EnhancedGenerateContentResponse>, response: Promise<...> }
// ChromeAdapterImpl also implements generateContentStream — works on-device with responseSchema.

const streamResult = await model.generateContentStream(request);
for await (const chunk of streamResult.stream) {
  const text = chunk.text(); // partial JSON — only use for char count / progress
}
const finalText = (await streamResult.response).text(); // complete JSON — parse this
```

### Expected speed improvements
| Phase | Before | After (estimate) |
|-------|--------|-----------------|
| First check (cold) | ~16 s | ~6-10 s (warm-up absorbs session creation on page load) |
| Subsequent checks (warm) | ~8-12 s | ~5-8 s (shorter prompt + less output) |
| Time-to-first-token (perceived) | silent wait | visible counter starts immediately |

**How to measure**: Use TestRunner. Run once — first-run time is the cold-start (minus warm-up). Avg of runs 2-14 is steady-state. Compare before/after a reload (without navigating away) to see warm-up benefit.
