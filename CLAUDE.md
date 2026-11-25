# ScamShield — CLAUDE.md

ScamShield checks suspicious messages (SMS, WhatsApp, email: bank alerts, BVN/NIN scams, job scams)
using Firebase AI Logic **hybrid on-device + cloud inference**. Built for the Firebase #BuildHybridAI
hackathon (Devpost). Deadline: **Nov 30, 2026, 11:00 PM Lagos time (2:00 PM PT)**. Solo dev on Windows.

---

## Tech stack & commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build → `dist/` |
| `npm run lint` | ESLint |
| `npm run preview` | Serve `dist/` locally |
| `firebase deploy --only firestore:rules` | Deploy Firestore rules |
| `firebase deploy --only hosting` | Deploy to Firebase Hosting |

- **Firebase project ID:** `scamshield-9b81e`
- **Firebase SDK:** `12.19.0` — do NOT upgrade or downgrade (a newer version failed to install)
- **AI provider:** Gemini Developer API (`GoogleAIBackend`)
- **App Check:** `ReCaptchaEnterpriseProvider`
- **Model constant:** `CLOUD_MODEL` in `src/config.js` — currently `'gemini-3.5-flash-lite'` (never hardcode elsewhere)

### Environment variables (`.env.local`, gitignored — see `.env.example`)

| Variable | Purpose |
|----------|---------|
| `VITE_RECAPTCHA_SITE_KEY` | reCAPTCHA Enterprise site key |
| `VITE_FIREBASE_APPCHECK_DEBUG_TOKEN` | App Check debug UUID for localhost |

---

## Folder structure

```
src/
  firebase.js           ← app init, App Check, getAI, remoteConfig
  config.js             ← all constants (CLOUD_MODEL, MASK_POLICY, ADVICE_BY_CATEGORY, agent consts…)
  ai/
    models.js           ← onDeviceModel (ONLY_ON_DEVICE), cloudModel (ONLY_IN_CLOUD)
    availability.js     ← getOnDeviceAvailability(), initDeviceModel()
    regexMask.js        ← regexMask(text), regexDetect(text)
    maskMessage.js      ← detectEntities(text), buildMaskedText() — ONLY_ON_DEVICE, never cloud
    rules.js            ← analyzeSignals(text) → { signals, ruleScore }
    prompts.js          ← buildScamCheckPrompt, buildMaskingPrompt, buildInvestigatePrompt
    schemas.js          ← SCAM_RESULT_SCHEMA, MASKING_SCHEMA + generation configs
    checkMessage.js     ← checkMessage(), onDeviceCheck(), cloudCheck(), ocrImage(), ocrImageCloud()
    investigate.js      ← legacy Google Search grounding (kept, not in main flow)
  agent/
    runAgent.js         ← runAgent(), continueAgent()
    tools/
      analyzeLink.js, checkCommunityReports.js, searchWeb.js, getScamTrends.js
  services/
    reports.js          ← queryReports(), saveReport() — hashed indicators, Firestore + mock
    hashIndicator.js    ← hashIndicator(), reportDocId()
  components/
    ModelStatus.jsx, MessageInput.jsx, VerdictCard.jsx, HighlightedMessage.jsx
    SendPreview.jsx, AgentPanel.jsx, InvestigationPanel.jsx (legacy), DevTestPanel.jsx
    dashboard/ComparisonChart.jsx, MessageTable.jsx, Dashboard.jsx
    pages/PrivacyPage.jsx
  dev/
    testMessages.js (20 msgs), TestRunner.jsx, aiOnlyCheck.js, maskTest.js, agentTest.js
  data/
    evalSnapshot.json   ← paste JSON export here to update dashboard
  App.jsx               ← full UI, hash routing (#/ main, #/accuracy dashboard)
  main.jsx, index.css
docs/
  architecture.md  ← how the system works (inference, routing, agent, masking, API patterns)
  decisions.md     ← key decisions and WHY, by session
  eval-results.md  ← test run data
  design.md        ← UI design tokens and component guide
  STATUS.md        ← current status and known issues
firestore.rules
firebase.json, .firebaserc
```

---

## NON-NEGOTIABLE RULES

### Privacy guarantees — never break these

1. **No raw text to cloud** without explicit user consent AND masking preview (SendPreview chip UI).
2. **Masking is ONLY_ON_DEVICE** — `maskMessage.js` and `regexMask.js` must never fall back to cloud.
3. **Community reports store fingerprints only** — SHA-256 hash the indicator on-device before any Firestore query or write; no raw phone numbers, URLs, or message text in Firestore.
4. **OCR cloud fallback** (`ocrImageCloud`) must only be called after `OcrConsentBubble` is explicitly confirmed by the user.
5. **Safe Browsing attribution** — when `analyze_link` returns a Safe Browsing result, show "Advisory provided by Google" with link to `safebrowsing.google.com`.
6. **`PREFER_ON_DEVICE` is permanently banned** — it silently sends raw text to cloud when Nano is unavailable. Never re-add it.

### Code rules

7. Never commit secrets: `.env.local`, App Check debug tokens, reCAPTCHA secret key. Firebase web config (apiKey, projectId, etc.) is public and fine in source.
8. `CLOUD_MODEL` defined once in `src/config.js` — never hardcode model names elsewhere.
9. Use only Firebase AI Logic (`firebase/ai`) — no other AI SDKs (no OpenAI, LangChain, etc.).
10. Use the modular Firebase JS SDK (`firebase/app`, `firebase/app-check`, `firebase/ai`).
11. No new npm libraries without explicit approval.
12. App Check must initialize before any Firebase service that requires it.
13. No real third-party brand names in test data or fictional brand lists — use fictional names only (Zenova Bank, Kora Bank, Halden Bank, Palmline Mobile, SwiftDrop, NovaPetro).

### Scope (feature freeze as of session 11)

14. **No new features.** Only: bug fixes, speed improvements, offline/PWA work, deployment, documentation.

---

## Pointers

For more detail, read the docs:

- **How the system works** (inference, routing, agent, masking, API patterns) → `docs/architecture.md`
- **Key decisions and WHY** (by session, condensed) → `docs/decisions.md`
- **Eval run history** → `docs/eval-results.md`
- **UI design tokens and component guide** → `docs/design.md`
- **Current status and known issues** → `docs/STATUS.md`
