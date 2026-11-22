// PII masking: replaces personal details with generic placeholders.
//
// !! CRITICAL PRIVACY RULE !!
// This module MUST NEVER fall back to cloud inference.
// Raw private text — names, phone numbers, account numbers, BVN/NIN — must
// NEVER leave the user's device.
//
// maskMessage() currently uses the regex fallback directly until AI masking
// is implemented (see TODO below). The on-device AI path will improve accuracy
// on edge cases; the regex layer ensures correctness when Nano is unavailable.
//
// TODO: implement on-device AI masking
//   1. Import onDeviceModel from './models'
//   2. Import MASKING_PROMPT from './prompts' (once implemented)
//   3. Try on-device masking first (must call initializeDeviceModel first)
//   4. If it throws, fall back to regexMask() (NOT to cloud — ever)
//   5. Return the masked text

import { regexMask } from './regexMask';

/**
 * @param {string} text - Raw message text that may contain PII
 * @returns {Promise<string>} - Text with PII replaced by placeholders
 */
export async function maskMessage(text) {
  // Regex fallback until on-device AI masking is implemented
  return regexMask(text);
}
