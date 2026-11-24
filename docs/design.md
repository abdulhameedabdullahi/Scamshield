# ScamShield — UI Design Plan

## Design brief summary
Target: everyday Nigerian adults on mobile, checking suspicious WhatsApp/SMS/email messages.
Mental model: forwarding a suspicious message to a trusted friend who replies in a chat.

---

## Design tokens

```css
/* Brand */
--plum-900: #2E1640   /* headings, logo dark */
--plum-700: #45245C   /* primary brand, buttons */
--plum-100: #EFE8F4   /* ScamShield reply bubbles */

/* Base */
--ink: #1B2230        /* body text */
--paper: #F7F8F6      /* app background */
--line: #E2DFE8       /* borders */

/* Verdict (never used for decoration) */
--scam:    #B42318 / --scam-bg:  #FDECEA
--warn:    #9A5B00 / --warn-bg:  #FFF4E0
--safe:    #1E7346 / --safe-bg:  #E8F5EC
```

## Type scale

| Token     | Size | Weight | Usage                         |
|-----------|------|--------|-------------------------------|
| heading-1 | 32px | 600    | Page titles (Bricolage)       |
| heading-2 | 24px | 600    | Section heads (Bricolage)     |
| heading-3 | 20px | 600    | Card heads (Bricolage)        |
| body      | 17px | 400    | UI text, bubbles (Atkinson)   |
| small     | 15px | 400    | Labels, badges (Atkinson)     |

Base line-height: 1.55. Sentence case everywhere.

---

## Layout wireframe

```
┌─────────────────────────────────────┐  ← TopBar  (60px)
│  🛡 ScamShield          ≡           │
├─────────────────────────────────────┤  ← ModelStatusBar (auto, only when relevant)
│                                     │
│  ┌── ScamShield bubble ────────┐    │
│  │ Hi! Paste any message…      │    │  ← WelcomeBubble
│  └─────────────────────────────┘    │
│  [Try: bank alert] [Try: job offer] │  ← ExampleChips
│                                     │
│           ┌──── user message ──┐    │  ← UserBubble
│           │ ALERT: your acc…   │    │
│           └────────────────────┘    │
│                                     │
│  ┌── ScamShield bubble ────────┐    │
│  │ I can already see 2 warning │    │  ← PrelimBubble
│  │ signs…                      │    │
│  └─────────────────────────────┘    │
│  ┌── ● ● ●  ─────────────────── ┐  │  ← TypingBubble
│                                     │
│  ┌── VerdictBubble ─────────── ┐   │  ← VerdictBubble (hero, animate in)
│  │ 🚨 This is a scam.           │   │
│  │ Explanation text…            │   │
│  │ What to do now               │   │
│  │ ☑ Don't click links          │   │
│  │ [Dig deeper online]          │   │
│  └──────────────────────────────┘   │
│                                     │
├─────────────────────────────────────┤  ← Composer (pinned, shadow above)
│  Paste the message here…      [→]   │
└─────────────────────────────────────┘
```

---

## Component list

| Component           | Description                                  |
|---------------------|----------------------------------------------|
| `Logo`              | SVG bubble→shield with checkmark             |
| `TopBar`            | Logo + "ScamShield" + ≡ menu                 |
| `ModelStatus`       | Single-line AI status below TopBar           |
| `MessageInput`      | Chat composer (textarea + paste + button)    |
| `VerdictCard`       | Hero verdict bubble from ScamShield          |
| `SendPreview`       | "Before we search online" review sheet       |
| `AgentPanel`        | Live step bubbles + final result             |
| `HighlightedMessage`| Inline phrase highlights (unchanged)         |
| `Dashboard`         | Accuracy page (restyled)                     |
| `PrivacyPage`       | 3-step privacy explainer                     |
| `AboutPage`         | One paragraph + credit                       |

---

## Bubble radii
- Incoming (ScamShield): `4px 18px 18px 18px`
- Outgoing (user): `18px 18px 4px 18px`
- Buttons: `14px`
- Inputs: `14px`
- Chips: `99px`

## Verdict icons + headlines
- scam:       🚨 "This is a scam."
- suspicious: ⚠️ "Be careful. This looks suspicious."
- safe:       ✅ "This message looks safe."
