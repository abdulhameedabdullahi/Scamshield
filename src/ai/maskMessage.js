// PII masking: replaces personal details with generic placeholders.
//
// !! CRITICAL PRIVACY RULE !!
// This function MUST use onDeviceModel (ONLY_ON_DEVICE).
// It must NEVER fall back to cloud inference.
// Raw private text — names, phone numbers, account numbers, BVN/NIN — must
// NEVER leave the user's device. If on-device AI is unavailable, the regex
// fallback below runs instead (better to mask imperfectly than to send raw
// text to the cloud).
//
// TODO: implement this function
//   1. Import onDeviceModel from './models'
//   2. Import MASKING_PROMPT from './prompts'
//   3. Try on-device masking first
//   4. If it throws, fall back to regexMask() below (NOT to cloud)
//   5. Return the masked text

/**
 * @param {string} text - Raw message text that may contain PII
 * @returns {Promise<string>} - Text with PII replaced by placeholders
 */
export async function maskMessage(text) {
  // For now, use the regex fallback directly until AI masking is implemented
  return regexMask(text);
}

/**
 * Regex-based safety net for PII masking.
 * This runs when on-device AI is unavailable and as a post-processing pass.
 * It is intentionally conservative — it may miss edge cases but won't
 * accidentally expose data.
 *
 * @param {string} text
 * @returns {string}
 */
export function regexMask(text) {
  return text
    // Nigerian phone numbers: 080/081/090/070 + 8 digits, optionally +234 prefix
    .replace(/(?:\+234|0)[789]\d{9}/g, '[PHONE]')
    // Generic international phone numbers
    .replace(/\+?\d[\d\s().-]{8,}\d/g, '[PHONE]')
    // Email addresses
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
    // Nigerian account numbers (10 digits, often standalone)
    .replace(/\b\d{10}\b/g, '[ACCOUNT]')
    // BVN / NIN (11 digits)
    .replace(/\b\d{11}\b/g, '[ID_NUMBER]')
    // Explicit BVN/NIN labels followed by digits
    .replace(/\b(BVN|NIN|bvn|nin)\s*[:=]?\s*\d+/g, '$1: [REDACTED]');
}
