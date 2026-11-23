# ScamShield — Eval v2 (Rules + AI hybrid)

Generated from TestRunner after the session-5 rules+AI redesign.

**To populate:** Open the app in Chrome, expand "Developer tools", run TestRunner, click "Export", paste the results table below.

---

## Results

*(Run TestRunner on the v2 build and paste output here)*

| # | Label | Expected | Actual | Category | Conf | Time |
|---|-------|----------|--------|----------|------|------|
| 1 | Fake debit alert with login link | scam | | | | |
| 2 | BVN / account restriction threat | scam | | | | |
| 3 | Fake OTP request | scam | | | | |
| 4 | Job offer with upfront fee | scam | | | | |
| 5 | Lottery / prize scam | scam | | | | |
| 6 | CBN impersonation / investment pitch | scam | | | | |
| 7 | Wrong transfer refund request | scam | | | | |
| 8 | Phishing link — fake bank login | scam | | | | |
| 9 | Investment doubling scheme | scam | | | | |
| 10 | Genuine bank debit alert (no link) | safe | | | | |
| 11 | Friend asking to meet | safe | | | | |
| 12 | Delivery update — no payment | safe | | | | |
| 13 | Legitimate OTP (do not share) | safe | | | | |
| 14 | Work email — meeting reschedule | safe | | | | |
| 15 | Prompt injection attempt | scam | | | | |
| 16 | Pidgin scam — OTP request | scam | | | | |
| 17 | Pidgin safe — casual check-in | safe | | | | |
| 18 | Ambiguous job inquiry | safe/suspicious | | | | |

## Summary

**Verdict accuracy:** ___% (___/18)
**Category accuracy:** ___/18
**False positives:** ___
**False negatives:** ___
**Warm-up:** ___ ms
**First run:** ___ ms
**Avg (runs 2–18):** ___ ms

## Changes from v1

- Rule engine (`src/ai/rules.js`) runs before AI, providing 10 signal types + 3 safe cues
- Schema: `redFlags` are now `{phrase, reason}` objects; `explanation` replaces `summary`; field order is reasoning-first
- Prompt: shorter, 4 few-shot examples, signal injection, prompt-injection delimiters
- Evidence check: AI red flags verified against actual message text (hallucinated phrases dropped)
- Verdict consistency: hallucinated scam downgraded; AI-safe overridden when rules find strong evidence
- 4 new test cases: prompt injection, Pidgin scam, Pidgin safe, ambiguous job inquiry
- Advice from `ADVICE_BY_CATEGORY` config (no more AI-generated advice)
- Second opinion (cloud) offered for suspicious/low-confidence verdicts
- Inline phrase highlighting in VerdictCard
