# ScamShield — Eval Baseline (v1: Pure AI, no rules)

Generated from TestRunner before the session-5 rules+AI redesign.

**To populate:** Open the app in Chrome, expand "Developer tools", run TestRunner, click "Export", paste the results table below.

---

## Results

*(Run TestRunner on the v1 build and paste output here)*

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

## Summary

**Verdict accuracy:** ___% (___/14)
**Category accuracy:** ___/14
**False positives:** ___
**False negatives:** ___
**Warm-up:** ___ ms
**First run:** ___ ms
**Avg (runs 2–14):** ___ ms

## Known issues that motivated the redesign

- Category contradicting verdict (verdict "safe" with a scam category)
- False positives on personal messages (e.g. "are we still meeting at the mall tomorrow by 4?" marked suspicious)
- Generic/repetitive AI-generated advice regardless of message type
- Low confidence on ambiguous messages with no mechanism to escalate
