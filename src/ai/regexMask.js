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
 * Detect PII-like entities in `text` and return them with character positions.
 * Returns an array sorted by start position with overlaps resolved (longer match wins).
 *
 * @param {string} text
 * @returns {Array<{text: string, type: string, start: number, end: number, source: 'regex'}>}
 */
export function regexDetect(text) {
  const raw = [];

  function addAll(re, type) {
    const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let m;
    while ((m = r.exec(text)) !== null) {
      raw.push({ text: m[0], type, start: m.index, end: m.index + m[0].length, source: 'regex' });
    }
  }

  // OTP codes: keyword context + 4-8 digit code (capture group 1 = digits only)
  {
    const r = /\b(?:OTP|code|token|PIN|passcode|password|verification)\s*(?:is|:|=|-)?\s*(\d{4,8})\b/gi;
    let m;
    while ((m = r.exec(text)) !== null) {
      const start = m.index + m[0].length - m[1].length;
      raw.push({ text: m[1], type: 'otp_code', start, end: start + m[1].length, source: 'regex' });
    }
  }

  // URLs with scheme
  addAll(/https?:\/\/[^\s<>"']+/, 'url');

  // Bare domains with known TLDs (not preceded by @ or / to avoid email/path confusion)
  {
    const r = /(?<![/@.])\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+(?:com|net|org|ng|co\.ng|edu|gov|io|info|biz|xyz|app)(?:[/?#][^\s<>"']*)?/g;
    let m;
    while ((m = r.exec(text)) !== null) {
      raw.push({ text: m[0], type: 'url', start: m.index, end: m.index + m[0].length, source: 'regex' });
    }
  }

  // Email addresses
  addAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, 'email');

  // Card numbers (16 digits grouped 4-4-4-4)
  addAll(/\b(?:\d{4}[- ]?){3}\d{4}\b/, 'card_number');

  // Nigerian phone numbers (specific format first)
  addAll(/(?:\+234|0)[789]\d{9}/, 'phone_number');

  // Explicitly labelled BVN/NIN — capture just the digits (group 1)
  {
    const r = /\b(?:BVN|NIN)\s*[:=]?\s*(\d{10,12})\b/gi;
    let m;
    while ((m = r.exec(text)) !== null) {
      const start = m.index + m[0].length - m[1].length;
      raw.push({ text: m[1], type: 'bvn_nin', start, end: start + m[1].length, source: 'regex' });
    }
  }

  // BVN/NIN standalone (11 digits)
  addAll(/\b\d{11}\b/, 'bvn_nin');

  // Account numbers (10 digits)
  addAll(/\b\d{10}\b/, 'account_number');

  // Generic international phone numbers (broad; runs after specific Nigerian)
  addAll(/\+?\d[\d\s().-]{7,}\d/, 'phone_number');

  // Resolve overlaps: sort by start (asc), then length (desc) so longer match wins a tie
  raw.sort((a, b) => a.start !== b.start ? a.start - b.start : (b.end - b.start) - (a.end - a.start));
  const resolved = [];
  let lastEnd = -1;
  for (const e of raw) {
    if (e.start >= lastEnd) {
      resolved.push(e);
      lastEnd = e.end;
    }
  }
  return resolved;
}

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
