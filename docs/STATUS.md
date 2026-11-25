# ScamShield — Pre-Deploy Audit Report

**Date:** 2026-11-25  
**Auditor:** Claude Code (session 11 audit / session 12 fixes)  
**Scope:** Full codebase read; P0 and P1 fixes applied in session 12.

---

## 1. Feature Inventory

| Feature | Files | Status |
|---------|-------|--------|
| Rule engine (Stage A, synchronous) | `src/ai/rules.js`, `App.jsx:buildPreliminaryVerdict` | ✅ Working |
| On-device scam check (Stage B, Gemini Nano) | `checkMessage.js:onDeviceCheck`, `models.js`, `availability.js` | ✅ Working |
| Cloud scam check (Stage B, consent-gated) | `checkMessage.js:cloudCheck`, `SendPreview.jsx` | ✅ Working |
| PII masking — regex layer | `regexMask.js` | ✅ Working |
| PII masking — on-device AI layer | `maskMessage.js:detectEntities` | ✅ Working |
| SendPreview consent gate | `SendPreview.jsx` | ✅ Working |
| Download + check flow | `checkMessage.js:downloadAndCheck`, `preloadDeviceModel` | ✅ Code correct; real Chrome needed to verify |
| VerdictCard (verdict, highlights, checklist, community badge) | `VerdictCard.jsx` | ✅ Working |
| ScamShield Agent (4 tools + loop) | `runAgent.js`, `AgentPanel.jsx`, tool files | ✅ Working |
| Follow-up chat in AgentPanel | `AgentPanel.jsx:handleFollowUp`, `runAgent.js:continueAgent` | ✅ Working |
| OCR — on-device path | `checkMessage.js:ocrImage` | ✅ Working |
| OCR — cloud consent path | `checkMessage.js:ocrImageCloud`, `OcrConsentBubble` in `App.jsx` | ✅ Working |
| Community reports query (Firestore read) | `reports.js:queryReports`, `hashIndicator.js` | ✅ Working (`USE_MOCK_REPORTS=false`) |
| Community reports write (Report button) | `reports.js:saveReport`, Anonymous Auth | ✅ Working |
| Share warning to contacts | `App.jsx:handleShare` | ✅ Working |
| Web Share Target (PWA share-to) | `manifest.json` | ✅ Declared |
| Accuracy dashboard | `dashboard/Dashboard.jsx`, `ComparisonChart.jsx` | ✅ Working (static from `evalSnapshot.json`) |
| Dev test harness | `dev/TestRunner.jsx`, `dev/testMessages.js` | ✅ Working (gated by `import.meta.env.DEV` only) |
| Privacy page, About page | `pages/PrivacyPage.jsx`, `pages/AboutPage.jsx` | ✅ Working |
| Hash routing (#check / #accuracy / #privacy / #about) | `App.jsx:hashToPage` | ✅ Working |
| Service worker + precache | `vite.config.js` (VitePWA), `dist/sw.js` | ✅ **Fixed session 12** |
| Self-hosted fonts | `main.jsx` (@fontsource imports), `index.html` (CDN removed) | ✅ **Fixed session 12** |
| Offline notice + disabled online actions | `App.jsx`, `VerdictCard.jsx` | ✅ **Fixed session 12** |
| Community query disclosure | `VerdictCard.jsx` source line | ✅ **Fixed session 12** |
| Per-device daily cloud limit (15/day) | `services/dailyQuota.js`, `App.jsx` | ✅ **Fixed session 12** |
| `hybridCheck()` | removed | ✅ **Dead code removed session 12** |
| `InvestigationPanel.jsx` | removed | ✅ **Dead code removed session 12** |
| `src/ai/investigate.js` | removed | ✅ **Dead code removed session 12** |
| `buildInvestigatePrompt()` | removed | ✅ **Dead code removed session 12** |
| Remote Config (`scam_trends`) | `getScamTrends.js` | ⚠️ Code correct; falls back gracefully; unverifiable without RC deployed |
| Google Safe Browsing in `analyze_link` | `safeBrowsing.js` | ⚠️ Silently skipped if `VITE_SAFE_BROWSING_API_KEY` absent |

---

## 2. Network / Data-Flow Audit

Every outbound network request the app can make, in order of when it fires:

### 2.1 ~~Google Fonts CDN~~ ✅ Fixed (session 12)
Google Fonts CDN removed from `index.html`. Fonts now self-hosted via `@fontsource/bricolage-grotesque` and `@fontsource/atkinson-hyperlegible`, bundled by Vite and precached by the service worker.

### 2.2 reCAPTCHA Enterprise (App Check)
- **When:** Page load; auto-refresh every ~1 hour
- **Source:** `firebase.js:58–63`
- **What:** Browser telemetry signals → Google, to generate App Check tokens that gate all Firebase calls
- **Data sent:** Browser fingerprint, interaction heuristics
- **Consent:** None (industry standard; covered by Google TOS)
- **UI disclosure:** ✅ PrivacyPage now names Google reCAPTCHA Enterprise explicitly (session 12 fix)

### 2.3 Firebase AI Logic — On-device check/masking
- **When:** User submits message; Gemini Nano available (`ONLY_ON_DEVICE`)
- **Data sent:** Nothing — text processed entirely locally
- **Consent:** None needed
- **UI copy:** ✅ "🔒 Your message stayed on this phone." (updated session 12; "Nothing was uploaded" removed)

### 2.4 Firestore read — Community indicator query
- **When:** Automatically, immediately after every check (`fetchCommunityData`), if the result contains a phone number or URL signal. Skipped when offline.
- **Source:** `reports.js:queryReports` → `hashIndicator(normalised)` → Firestore `.getDocs()`
- **Data sent:** SHA-256(salt + normalised phone/URL) — 64-char hex hash sent to Firestore
- **Consent:** None given (fingerprint is irreversible; privacy-preserving)
- **UI disclosure:** ✅ VerdictCard source line now shows "We checked an anonymous fingerprint of this [phone number / link] against reports from other users." when lookup ran (session 12 fix). Offline: lookup skipped silently with no disclosure.
- **Auth:** `ensureAuth()` called before Firestore query (session 12 fix)

### 2.5 Firebase AI Logic — Cloud scam check
- **When:** User in `unsupported`/`unavailable` state AND user clicks "Search online" in SendPreview
- **Source:** `checkMessage.js:cloudCheck`
- **Data sent:** Masked text (PII replaced with placeholders; phone numbers and URLs kept per `MASK_POLICY`)
- **Consent gate:** SendPreview — shows user exactly what will be sent before transmission ✅
- **UI copy:** ✅ "☁️ Your message was checked online with personal details hidden." (updated session 12)

### 2.6 Firebase AI Logic — Cloud OCR
- **When:** User uploads image; on-device OCR unavailable; user clicks "Upload and read"
- **Source:** `checkMessage.js:ocrImageCloud`
- **Data sent:** Base64-encoded image
- **Consent gate:** `OcrConsentBubble` explicitly shown ✅. Disabled when offline ✅ (session 12)

### 2.7 Firebase AI Logic — Agent cloud calls (startChat / sendMessage)
- **When:** User taps "Dig deeper online" → reviews SendPreview → agent loop starts
- **Source:** `runAgent.js`
- **Data sent:** Masked text + device verdict + signals. Tool results sent as FunctionResponse parts.
- **Consent gate:** SendPreview gate before agent starts ✅. Disabled when offline ✅ (session 12)

### 2.8 Firebase AI Logic + Google Search grounding (`search_web` tool)
- **When:** During agent run, when model calls `search_web`
- **Source:** `searchWeb.js`
- **Data sent:** Search query string (derived by cloud model from already-masked text; no raw PII)
- **Consent gate:** Via agent SendPreview ✅

### 2.9 Google Safe Browsing v4
- **When:** During agent run, when model calls `analyze_link` AND `VITE_SAFE_BROWSING_API_KEY` is set
- **Source:** `safeBrowsing.js`
- **Data sent:** URL from message + API key as query param (`?key=…`) — standard for this API
- **Consent gate:** Via agent SendPreview ✅
- **Attribution:** "Advisory provided by Google" link to `safebrowsing.google.com` shown when result is not skipped ✅
- **Note:** Restrict the API key to your production referrer domain in GCP.

### 2.10 Anonymous Firebase Auth
- **When:** User clicks "Report this scam" (triggers `ensureAuth()`), or community query (session 12 fix adds `ensureAuth()` before `queryReports`)
- **Source:** `reports.js:ensureAuth`
- **Data sent:** Standard Firebase anonymous sign-in handshake (no user data)
- **Consent:** Community query: automatic / Report: user-initiated ✅

### 2.11 Firestore write — Community report
- **When:** User clicks "Report this scam"
- **Source:** `reports.js:saveReport`
- **Data stored:** `{ indicatorHash, kind, category, uid, createdAt }` — no raw indicator, no message text
- **Consent:** User-initiated button click ✅

### 2.12 Firebase Remote Config
- **When:** During agent run when model calls `get_scam_trends`
- **Source:** `getScamTrends.js`
- **Data sent:** Standard RC fetch request (no personal data)
- **Consent gate:** Via agent flow ✅

---

## 3. Hackathon Requirements Check

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Firebase AI Logic imported and called at runtime | ✅ Pass | `firebase/ai` imported `firebase.js:7`; `getGenerativeModel` called `models.js:43,49` |
| Hybrid inference used meaningfully | ✅ Pass | `ONLY_ON_DEVICE` for check+masking (`models.js:43`); `ONLY_IN_CLOUD` for cloud path+agent (`models.js:49`); documented in README with table |
| App Check configured for dev and production | ✅ Pass | `ReCaptchaEnterpriseProvider` at `firebase.js:58`; debug token in `if (import.meta.env.DEV)` block (`firebase.js:42`) — tree-shaken from production build |
| LICENSE file at repo root (Apache-2.0) | ✅ Pass | `LICENSE` tracked by git; full Apache-2.0 text present |
| `package.json` license field | ✅ Pass | `"license": "Apache-2.0"` (`package.json:5`) |
| README has setup instructions | ✅ Pass | 7-step Getting Started section |
| README explains Firebase AI Logic usage | ✅ Pass | Hybrid inference table + flowchart |
| README has value proposition | ✅ Pass | "The Problem" and "The Solution" sections |
| No secrets committed | ⚠️ See note | `src/firebase.js` contains the **public** Firebase web config API key — this is by design; App Check + Firestore rules enforce security, not key secrecy. No `.env.local`, no private keys, no debug tokens in git. |
| No real third-party brand names | ✅ **Fixed session 12** | `GTBank` → `Halden Bank`; `CBN NOTICE` → `NRA NOTICE`; `EFCC, CBN, NCC` → generic description |
| App supports English | ✅ Pass | `lang="en"` on `<html>`; all UI text in English |

---

## 4. Production Readiness

### 4.1 Service worker / offline load
**Status: ✅ Fixed (session 12)**

`vite-plugin-pwa` added with `generateSW` strategy. Precaches 23 entries: index.html, all JS/CSS chunks, all self-hosted font files (woff/woff2), icons. SW registered in production only (`devOptions: { enabled: false }`). `navigateFallback: '/index.html'` for SPA routing. App shell loads offline.

### 4.2 Developer tools in production
**Status: ✅ Fixed (session 12)**

`isDev = import.meta.env.DEV` — hash backdoor removed. Dev panel only visible in dev builds.

### 4.3 App Check debug token
**Status: ✅ Correct**

`firebase.js:42` gates the debug token with `if (import.meta.env.DEV)`. Vite strips this block in production builds. The token does not appear in `dist/`.

### 4.4 Cloud quota protection
**Status: ✅ Fixed (session 12)**

- Per-device daily cap: `DAILY_CLOUD_LIMIT = 15` (config.js); counter stored in localStorage keyed by date (`services/dailyQuota.js`)
- Quota checked before: `handleCloudSendConfirm`, `handleOcrCloudConfirm`, `handleInvestigateRequest`
- Quota incremented after each successful cloud call
- `AGENT_MAX_STEPS = 6` limits tool-call rounds per agent run ✅
- `MessageInput` enforces 2000-char limit ✅
- Exponential backoff on 429 in `runAgent.js` ✅

### 4.5 Firestore rules
**Status: ✅ Fixed (session 12)**

| Operation | Rule |
|-----------|------|
| Get (single doc) | `allow get: if request.auth != null` |
| List (query) | `allow list: if request.auth != null && request.query.limit <= 100` |
| Create | Requires auth + field allow-list + 64-char hash + kind enum + category enum + uid match + server timestamp |
| Update | `allow update: if false` |
| Delete | `allow delete: if false` |

Category field now validated against full enum (12 values). `ensureAuth()` called before `queryReports`.

**Note:** App Check enforcement for Firestore should be enabled in the Firebase console (Firebase App Check → Firestore → Enforce) for full protection.

### 4.6 Remote Config
One key expected: `scam_trends` (string). Default: `SCAM_TRENDS_DEFAULT` in `config.js`. No other RC params. Gracefully falls back if not configured.

### 4.7 Environment variables for production

| Variable | Required? | Notes |
|----------|-----------|-------|
| `VITE_RECAPTCHA_SITE_KEY` | **Required** | Without it App Check fails; all Firebase calls rejected |
| `VITE_FIREBASE_APPCHECK_DEBUG_TOKEN` | Dev only | Must NOT be set in production; guarded in code |
| `VITE_SAFE_BROWSING_API_KEY` | Optional | Skipped gracefully if absent; restrict to production referrer in GCP if set |

### 4.8 Build output
**Status: ✅ Passes (session 12)**
```
dist/index.html                    1.10 kB
dist/assets/index-*.css           11.95 kB (gzip: 2.98 kB)
dist/assets/index-*.js           972.84 kB (gzip: 293.40 kB)
dist/sw.js                        (service worker, generateSW)
+ font files (woff/woff2, all precached)
```
Single chunk exceeds 500 kB (Firebase SDK is the main contributor). `npm run lint` passes clean. `npm run build` passes clean.

---

## 5. Code Health

### 5.1 Dead code
All dead code removed in session 12:

| Item | Status |
|------|--------|
| `hybridCheck()` | ✅ Removed — also removed from `TestRunner.jsx` and `Dashboard.jsx` imports |
| `InvestigationPanel.jsx` | ✅ Deleted |
| `investigate.js` | ✅ Deleted |
| `buildInvestigatePrompt()` | ✅ Removed |
| No-op `setInterval` | ✅ Removed (`checkStartTime` state + `startProgress`/`stopProgress` helpers also removed) |

### 5.2 TODO / open items in code

| File | Line | Note |
|------|------|------|
| `config.js` | — | `TODO: add official reporting URLs` comment still present (non-blocking) |

### 5.3 README stale sections
Several sections are out of date and would mislead judges:

- **Architecture diagram** (`README.md:116`): Node B says `PREFER_ON_DEVICE` — this mode is **permanently banned** per CLAUDE.md rule 6.
- **Project structure table**: `checkMessage.js` annotated `PREFER_ON_DEVICE (🚧)`; `investigate.js` shown as active (`🚧`).
- **Features list**: "Screenshot / image input" shown as `🚧 in progress` — it is fully implemented.
- **Firebase Products table**: Firestore, Auth, Remote Config shown as `🚧 In progress` — all are wired up.
- **Testing Instructions for Judges**: "🚧 Live demo link coming soon" — must be replaced with real deploy URL.

**README update deferred to session 13 (deploy session).**

### 5.4 Error handling
- Uncaught errors in `ocrImageCloud` bubble up to `handleOcrCloudConfirm` which catches them — OK.
- `fetchCommunityData` swallows all errors silently — appropriate (non-fatal).
- Firestore `queryReports` falls back to mock data on error — could mask real Firestore rule misconfigurations during testing.

### 5.5 Accessibility
| Item | Status |
|------|--------|
| `lang="en"` on `<html>` | ✅ |
| `aria-live="polite"` on typing bubble, prelim bubble, verdict card | ✅ |
| `role="dialog"` + `aria-modal="true"` on menu overlay | ✅ |
| `aria-current="page"` on active menu link | ✅ |
| `role="alert"` on error bubble | ✅ |
| Focus management on `OcrConsentBubble` open | ❌ No auto-focus (P2) |
| Focus trap in menu overlay | ❌ Missing (P2) |

---

## 6. Remaining Issues

### P0 — All fixed ✅

### P1 — All fixed ✅

### P2 — Deferred / nice to have

1. Use dynamic `import()` for Dashboard, DevTestPanel, TestRunner to reduce initial bundle below 500 kB.
2. Add focus trap to menu overlay and auto-focus first button in `OcrConsentBubble` on open.
3. Restrict Safe Browsing API key to production referrer domain in GCP (documented in notes above).
4. Update README for judges (deploy URL, remove stale sections) — deferred to deploy session.
5. Enable App Check enforcement for Firestore in Firebase console.
