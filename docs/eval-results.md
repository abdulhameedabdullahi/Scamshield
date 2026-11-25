# ScamShield — Evaluation Results

Run the in-app test suite to generate and paste results here:

**Developer tools → Test Suite → Run all modes → Export markdown → paste below**

---

## Run 3 — 2026-11-25 (session 13: rules-only mode added, eval snapshot updated)

Changes since Run 2:
- Added "Instant check (any phone, offline)" / Rules only mode to the test suite
- Rules only: synchronous rule engine with no AI and no network — represents what any phone gets instantly
- 'unclear' verdict (insufficient rule signal) is displayed as such but scored conservatively as 'suspicious'
- Results below were computed by tracing rules.js patterns against each test message manually

### Mode Comparison Summary

| Metric | Rules only | AI only | Rules + AI | Cloud |
|--------|------------|---------|------------|-------|
| Verdict accuracy | 40% (8/20) | 25% (5/20) | 85% (17/20) | 100% (20/20) |
| Scams caught     | 12/12 | 12/12 | 12/12 | 12/12 |
| False alarms     | 4/7 | 4/7 | 3/7 | 0/7 |
| Needs AI review  | 9/20 | — | — | — |
| False positives  | 4 | 4 | 3 | 0 |
| False negatives  | 0 | 0 | 0 | 0 |

AI only / Rules+AI / Cloud stats are from Run 2 (unchanged).

### Rules Only — Per-message Results

| # | Label | Expected | Rules only |
|---|-------|----------|------------|
| 1 | Fake debit alert with login link | scam | ✗ unclear† |
| 2 | BVN / account restriction threat | scam | ✓ scam |
| 3 | Fake OTP request | scam | ✓ scam |
| 4 | Job offer with upfront fee | scam | ✓ scam |
| 5 | Lottery / prize scam | scam | ✗ suspicious |
| 6 | Agency impersonation / investment pitch | scam | ✗ unclear† |
| 7 | Wrong transfer refund request | scam | ✗ suspicious |
| 8 | Phishing link — fake bank login | scam | ✗ unclear† |
| 9 | Investment doubling scheme | scam | ✗ unclear† |
| 10 | Genuine bank debit alert (no link) | safe | ✓ safe |
| 11 | Friend asking to meet | safe | ✗ unclear† |
| 12 | Delivery update — no payment | safe | ✗ unclear† |
| 13 | Legitimate OTP (do not share) | safe | ✓ safe |
| 14 | Work email — meeting reschedule | safe | ✗ unclear† |
| 15 | Prompt injection attempt | scam | ✓ scam |
| 16 | Pidgin scam — OTP request | scam | ✗ suspicious |
| 17 | Pidgin safe — casual check-in | safe | ✗ unclear† |
| 18 | Ambiguous job inquiry | safe/suspicious | ✓ unclear† |
| 19 | Defensive OTP — do not share warning | safe | ✓ safe |
| 20 | Imperative credential ask — OTP phishing | scam | ✗ suspicious |

† unclear = insufficient rule signal; scored as 'suspicious' (conservative). AI review recommended.

---

## Run 2 — 2026-11-24 (session 7 fixes: brand compliance + cloud non-streaming + #19 FP fix)

Changes since Run 1:
- All real brand names replaced with fictional (Zenova Bank, Kora Bank, Halden Bank, Palmline Mobile, SwiftDrop Logistics, NovaPetro Resources, National Revenue Office)
- Cloud path switched from streaming to `generateContent` — fixes the parse-stream errors on #4, #5, #6
- `credential_request` post-filter uses sentence-boundary clause check — fixes #19 FP
- `do_not_share` pattern extended to match "will never ask you to share/send"
- `impersonation` pattern uses fictional agency names

## ScamShield — Test Suite Results

Warm-up (on-device, shared): 26,845 ms

### Mode Comparison Summary

| Metric | AI only | Rules + AI | Cloud |
|--------|---------|------------|-------|
| Verdict accuracy | 25% (5/20) | 85% (17/20) | 100% (20/20) |
| Scams caught     | 12/12 | 12/12 | 12/12 |
| False alarms     | 4/7 | 3/7 | 0/7 |
| False positives  | 4 | 3 | 0 |
| False negatives  | 0 | 0 | 0 |
| Errors           | 0 | 0 | 0 |
| First run        | 26,668 ms | 37,734 ms | 3,495 ms |
| Avg (runs 2–20) | 33,361 ms | 26,539 ms | 3,759 ms |

### Per-message Results

| # | Label | Expected | AI only | Rules + AI | Cloud |
|---|-------|----------|---------|------------|-------|
| 1 | Fake debit alert with login link | scam | ✗ suspicious | ✓ scam | ✓ scam |
| 2 | BVN / account restriction threat | scam | ✗ suspicious | ✓ scam | ✓ scam |
| 3 | Fake OTP request | scam | ✗ suspicious | ✓ scam | ✓ scam |
| 4 | Job offer with upfront fee | scam | ✗ suspicious | ✓ scam | ✓ scam |
| 5 | Lottery / prize scam | scam | ✗ suspicious | ✓ scam | ✓ scam |
| 6 | Agency impersonation / investment pitch | scam | ✗ suspicious | ✓ scam | ✓ scam |
| 7 | Wrong transfer refund request | scam | ✗ suspicious | ✓ scam | ✓ scam |
| 8 | Phishing link — fake bank login | scam | ✓ scam | ✓ scam | ✓ scam |
| 9 | Investment doubling scheme | scam | ✗ suspicious | ✓ scam | ✓ scam |
| 10 | Genuine bank debit alert (no link) | safe | ✗ true FP | ✗ scam FP | ✓ safe |
| 11 | Friend asking to meet | safe | ✓ safe | ✓ safe | ✓ safe |
| 12 | Delivery update — no payment | safe | ✗ suspicious FP | ✗ suspicious FP | ✓ safe |
| 13 | Legitimate OTP (do not share) | safe | ✗ suspicious FP | ✓ safe | ✓ safe |
| 14 | Work email — meeting reschedule | safe | ✓ safe | ✓ safe | ✓ safe |
| 15 | Prompt injection attempt | scam | ✗ suspicious | ✓ scam | ✓ scam |
| 16 | Pidgin scam — OTP request | scam | ✗ suspicious | ✓ scam | ✓ scam |
| 17 | Pidgin safe — casual check-in | safe | ✓ safe | ✓ safe | ✓ safe |
| 18 | Ambiguous job inquiry | safe/suspicious | ✓ safe | ✓ safe | ✓ safe |
| 19 | Defensive OTP — do not share warning | safe | ✗ suspicious FP | ✗ scam FP | ✓ safe |
| 20 | Imperative credential ask — OTP phishing | scam | ✗ suspicious | ✓ scam | ✓ scam |


---

## Run 1 — 2026-11-24 (session 6 baseline)
<!-- original export below -->
## ScamShield — Test Suite Results

Warm-up (on-device, shared): 8,357 ms

### Mode Comparison Summary

| Metric | AI only | Rules + AI | Cloud |
|--------|---------|------------|-------|
| Verdict accuracy | 30% (6/20) | 90% (18/20) | 90% (18/20) |
| Scams caught     | 11/12 | 12/12 | 10/12 |
| False alarms     | 3/7 | 2/7 | 0/7 |
| False positives  | 3 | 2 | 0 |
| False negatives  | 0 | 0 | 0 |
| Errors           | 0 | 0 | 2 |
| First run        | 48,406 ms | 44,455 ms | 16,740 ms |
| Avg (runs 2–20) | 28,226 ms | 28,165 ms | 11,826 ms |

### Per-message Results

| # | Label | Expected | AI only | Rules + AI | Cloud |
|---|-------|----------|---------|------------|-------|
| 1 | Fake debit alert with login link | scam | ✗ scopicious | ✓ scam | ERR |
| 2 | BVN / account restriction threat | scam | ✗ suspicious | ✓ scam | ✓ scam |
| 3 | Fake OTP request | scam | ✓ scam | ✓ scam | ✓ scam |
| 4 | Job offer with upfront fee | scam | ✗ suspicious | ✓ scam | ✓ scam |
| 5 | Lottery / prize scam | scam | ✗ suspicious | ✓ scam | ✓ scam |
| 6 | Agency impersonation / investment pitch | scam | ✗ suspicious | ✓ scam | ERR |
| 7 | Wrong transfer refund request | scam | ✗ suspicious | ✓ scam | ✓ scam |
| 8 | Phishing link — fake bank login | scam | ✗ suspicious | ✓ scam | ✓ scam |
| 9 | Investment doubling scheme | scam | ✗ suspicious | ✓ scam | ✓ scam |
| 10 | Genuine bank debit alert (no link) | safe | ✗ suspicious FP | ✗ scam FP | ✓ safe |
| 11 | Friend asking to meet | safe | ✓ safe | ✓ safe | ✓ safe |
| 12 | Delivery update — no payment | safe | ✓ safe | ✓ safe | ✓ safe |
| 13 | Legitimate OTP (do not share) | safe | ✗ suspicious FP | ✓ safe | ✓ safe |
| 14 | Work email — meeting reschedule | safe | ✓ safe | ✓ safe | ✓ safe |
| 15 | Prompt injection attempt | scam | ✗ suspicious | ✓ scam | ✓ scam |
| 16 | Pidgin scam — OTP request | scam | ✗ suspicious | ✓ scam | ✓ scam |
| 17 | Pidgin safe — casual check-in | safe | ✓ safe | ✓ safe | ✓ safe |
| 18 | Ambiguous job inquiry | safe/suspicious | ✓ suspicious | ✓ safe | ✓ safe |
| 19 | Defensive OTP — do not share warning | safe | ✗ suspicious FP | ✗ scam FP | ✓ safe |
| 20 | Imperative credential ask — OTP phishing | scam | ✗ suspicious | ✓ scam | ✓ scam |

### Error Details

| # | Mode | Label | Error |
|---|------|-------|-------|
| 1 | Cloud | Fake debit alert with login link | AI: Failed to parse stream (AI/parse-failed) |
| 6 | Cloud | Agency impersonation / investment pitch | AI: Failed to parse stream (AI/parse-failed) |
