# ScamShield — Evaluation Results

Run the in-app test suite to generate and paste results here:

**Developer tools → Test Suite → Run all modes → Export markdown → paste below**

<!-- paste export here -->
## ScamShield — Test Suite Results

Warm-up (on-device, shared): 15,632 ms

### Mode Comparison Summary

| Metric | AI only | Rules + AI | Cloud |
|--------|---------|------------|-------|
| Verdict accuracy | 0% (0/18) | 93% (14/18) | 100% (10/18) |
| False positives  | 6 | 1 | 0 |
| False negatives  | 0 | 0 | 0 |
| First run        | 29,230 ms | 21,223 ms | 3,671 ms |
| Avg (runs 2–18) | 19,600 ms | 20,064 ms | 2,930 ms |

### Per-message Results

| # | Label | Expected | AI only | Rules + AI | Cloud |
|---|-------|----------|---------|------------|-------|
| 1 | Fake debit alert with login link | scam | ✗ suspicious | ✓ scam | ✓ scam |
| 2 | BVN / account restriction threat | scam | ✗ suspicious | ✓ scam | ERR |
| 3 | Fake OTP request | scam | ✗ suspicious | ✓ scam | ERR |
| 4 | Job offer with upfront fee | scam | ✗ suspicious | ✓ scam | ERR |
| 5 | Lottery / prize scam | scam | ERR | ✓ scam | ✓ scam |
| 6 | CBN impersonation / investment pitch | scam | ✗ suspicious | ERR | ERR |
| 7 | Wrong transfer refund request | scam | ✗ suspicious | ERR | ✓ scam |
| 8 | Phishing link — fake bank login | scam | ✗ suspicious | ✓ scam | ✓ scam |
| 9 | Investment doubling scheme | scam | ERR | ✓ scam | ✓ scam |
| 10 | Genuine bank debit alert (no link) | safe | ✗ suspicious FP | ✓ safe | ✓ safe |
| 11 | Friend asking to meet | safe | ✗ SAFE FP | ✓ safe | ✓ safe |
| 12 | Delivery update — no payment | safe | ✗ suspicious FP | ✓ safe | ✓ safe |
| 13 | Legitimate OTP (do not share) | safe | ✗ suspicious FP | ✗ scam FP | ✓ safe |
| 14 | Work email — meeting reschedule | safe | ✗ SAFE FP | ✓ safe | ✓ safe |
| 15 | Prompt injection attempt | scam | ✗ SAFE | ✓ scam | ERR |
| 16 | Pidgin scam — OTP request | scam | ✗ suspicious | ERR | ERR |
| 17 | Pidgin safe — casual check-in | safe | ✗ suspicious FP | ✓ safe | ERR |
| 18 | Ambiguous job inquiry | safe/suspicious | ✗ SAFE | ✓ safe | ERR |