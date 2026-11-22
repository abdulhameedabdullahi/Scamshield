// Regex-based PII masking — the safety net layer.
//
// Used in two places:
//  1. maskMessage.js — as the fallback when on-device AI is unavailable
//  2. checkMessage.js — to mask text BEFORE sending to the cloud (consent path)
//
// Errs on the side of masking more rather than less. It may occasionally
// mask things that aren't PII (e.g. a 10-digit order number), but that is
// safer than leaking real account numbers or phone numbers.

/**
 * Replace PII-like patterns in `text` with generic placeholders.
 * @param {string} text
 * @returns {string}
 */
export function regexMask(text) {
  return text
    // ── Phone numbers ──────────────────────────────────────────────────────
    // Nigerian numbers: +234 or 0 followed by 7/8/9 and 9 more digits
    .replace(/(?:\+234|0)[789]\d{9}/g, '[PHONE]')
    // Generic international numbers (7+ digit runs with optional separators)
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[PHONE]')

    // ── Email addresses ────────────────────────────────────────────────────
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')

    // ── Card numbers (16-digit, optionally grouped 4-4-4-4) ───────────────
    .replace(/\b(?:\d{4}[- ]?){3}\d{4}\b/g, '[CARD]')

    // ── Nigerian bank account numbers (exactly 10 digits, standalone) ──────
    .replace(/\b\d{10}\b/g, '[ACCOUNT]')

    // ── BVN / NIN (exactly 11 digits, standalone) ──────────────────────────
    .replace(/\b\d{11}\b/g, '[ID_NUMBER]')

    // ── Explicit BVN/NIN labels ────────────────────────────────────────────
    .replace(/\b(BVN|NIN|bvn|nin)\s*[:=]?\s*\d+/g, '$1: [REDACTED]');
}
