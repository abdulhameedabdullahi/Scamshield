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
  config.js             ← CLOUD_MODEL, APP_NAME, REPORTING_TIPS, ADVICE_BY_CATEGORY constants
  ai/
    models.js           ← Creates & exports: onDeviceModel, cloudModel (2 models only — no PREFER_ON_DEVICE)
    availability.js     ← getOnDeviceAvailability(), initDeviceModel() helpers
    regexMask.js        ← Standalone PII regex masker: regexMask(text) — no AI, runs synchronously
    maskMessage.js      ← maskMessage(text) — imports from regexMask.js; NEVER falls back to cloud
    rules.js            ← analyzeSignals(text) → { signals, ruleScore } — pure JS rule engine
    prompts.js          ← buildScamCheckPrompt(text, signals?, scamTrends?) — prompt with signal injection
    schemas.js          ← SCAM_RESULT_SCHEMA (reasoning-first field order), SCAM_CHECK_GENERATION_CONFIG
    checkMessage.js     ← Routing + rules+AI flow: checkMessage(), onDeviceCheck(), cloudCheck(),
                           downloadAndCheck(), preloadDeviceModel(), warmUpDeviceModel(), parseCheckResult()
    investigate.js      ← Stub: investigate(maskedText) — ONLY_IN_CLOUD (TODO)
  services/
    reports.js          ← Stub: Firestore community reports (TODO)
  components/
    ModelStatus.jsx     ← On-device availability banner + pre-download button with progress bar
    MessageInput.jsx    ← Textarea, Check button, Clear button, char counter (2000 max)
    VerdictCard.jsx     ← Result card with inline phrase highlighting, advice from config, second opinion button
    HighlightedMessage.jsx ← Renders text with coloured underline highlights and hover tooltips
    ConsentDialog.jsx   ← Inline consent UI for the cloud check path
    DevTestPanel.jsx    ← Dev test UI: availability status + on-device/cloud hello-world buttons
  dev/
    testMessages.js     ← 18 synthetic test messages (IDs 1-18); expected may be array
    TestRunner.jsx      ← Batch test runner: FP/FN tracking, Export button for eval markdown
  App.jsx               ← Full app UI; second opinion flow; DevTestPanel + TestRunner behind toggle
  main.jsx              ← Vite entry point (unchanged from template)
  index.css             ← Global styles (cleaned up from Vite template)
docs/
  eval-baseline.md      ← Template for v1 baseline results (populate by running TestRunner)
  eval-v2.md            ← Template for v2 results (populate after redesign)
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

---

## Decisions made in session 5 (rules + AI redesign)

**Problem:** Gemini Nano is unreliable at complex multi-field output in one pass — contradictory fields, false positives on casual messages, hallucinated red-flag phrases not present in the message.

**Solution:** RULES + AI hybrid architecture.

### New architecture

| Step | File | What it does |
|------|------|-------------|
| 1. Rule engine | `src/ai/rules.js` | Pure JS, synchronous. Detects 10 signal types + 3 safe cues. Returns `{ signals, ruleScore }`. |
| 2. Build prompt | `src/ai/prompts.js` | Injects signals into prompt; wraps message in `<<<MESSAGE…MESSAGE>>>` delimiters; 4 few-shot examples. |
| 3. AI reasoning | on-device / cloud | Sees message + signals. Schema forces reasoning-first field order: `redFlags → explanation → verdict → confidence → category`. |
| 4. Evidence check | `checkMessage.js` | Drops AI red flags whose `phrase` doesn't exist in the analyzed text (hallucination prevention). |
| 5. Merge + override | `checkMessage.js` | Merges rule signals as additional red flags (deduplicated). Applies verdict overrides. |

### Signal types
- **Positive (risk):** `link` (+3), `credential_request` (+4), `payment_request` (+3), `account_number` (+1), `phone_number` (+1), `urgency` (+2), `threat_or_block` (+2), `prize_or_offer` (+2), `impersonation` (+3), `ai_instruction` (+5)
- **Negative (safe cues):** `do_not_share` (-4), `masked_account` (-3), `standard_alert` (-2, compound: detected when no link/credential found and standard alert fields present)

### Verdict consistency overrides
1. **Prompt injection**: `ai_instruction` signal detected → upgrade safe to suspicious; ensure the injection phrase appears in redFlags.
2. **Hallucinated scam**: `verdict==='scam'` with 0 verified evidence AND `ruleScore < 2` → downgrade to suspicious.
3. **Missed risk**: `verdict==='safe'` with 0 AI evidence but ≥2 rule flags AND `ruleScore ≥ 6` → upgrade to suspicious.
4. **Safe enforcement**: safe verdict always forces `category='none'` and `redFlags=[]`.

### Schema change (v1 → v2)
| Field | v1 | v2 |
|-------|----|----|
| `redFlags` | `string[]` | `{phrase: string, reason: string}[]` |
| `summary` | one sentence | removed (replaced by `explanation`) |
| `explanation` | — | new: one sentence explaining verdict |
| `advice` | AI-generated | removed from AI schema; now `ADVICE_BY_CATEGORY` from config |
| Field order | verdict first | `redFlags → explanation → verdict → confidence → category` (reasoning-first) |

### New return shape from checkMessage / onDeviceCheck / cloudCheck
```js
{
  verdict,         // 'scam' | 'suspicious' | 'safe'
  confidence,      // 'low' | 'medium' | 'high'
  category,        // 12 enum values | 'none'
  redFlags,        // [{phrase, reason, source: 'ai'|'rule', start, end}] — start/end for highlighting
  explanation,     // one sentence
  signals,         // full signal array from analyzeSignals()
  source,          // 'on-device' | 'cloud'
  durationMs,
  needsSecondOpinion,  // true when verdict==='suspicious' || confidence==='low'
  maskedText?,     // cloud path only
}
```

### New and updated files
- **`src/ai/rules.js`** (NEW) — `analyzeSignals(text)` → `{ signals, ruleScore }`
- **`src/ai/schemas.js`** (UPDATED) — new nested redFlags schema; removed summary/advice
- **`src/ai/prompts.js`** (UPDATED) — `buildScamCheckPrompt(text, signals, scamTrends?)` with 4 few-shot examples and signal injection
- **`src/ai/checkMessage.js`** (UPDATED) — imports `analyzeSignals`; full evidence check + consistency logic; `needsSecondOpinion` flag
- **`src/config.js`** (UPDATED) — added `ADVICE_BY_CATEGORY` per-category static advice
- **`src/components/HighlightedMessage.jsx`** (NEW) — char-level highlighting; underline + colour; hover shows reason
- **`src/components/VerdictCard.jsx`** (UPDATED) — shows `explanation`; `{phrase,reason}` redFlags; `ADVICE_BY_CATEGORY` advice; `HighlightedMessage`; second opinion button when `needsSecondOpinion`
- **`src/App.jsx`** (UPDATED) — second opinion flow: separate state machine, consent gate, side-by-side result display
- **`src/dev/testMessages.js`** (UPDATED) — 4 new messages (IDs 15-18): prompt injection, Pidgin scam, Pidgin safe, ambiguous job inquiry. `expected` and `expectedCategory` now accept arrays.
- **`src/dev/TestRunner.jsx`** (UPDATED) — supports array `expected`; tracks FP/FN; "Export" button generates markdown for eval files
- **`docs/eval-baseline.md`** (NEW) — template for v1 baseline results
- **`docs/eval-v2.md`** (NEW) — template for v2 results

### Notes on temperature/topK
Checked `@firebase/ai` type definitions: `temperature` and `topK` exist in `LanguageModelCreateCoreOptions` but are marked `@deprecated`. They were NOT set — deprecated fields may behave inconsistently across Chrome versions.
