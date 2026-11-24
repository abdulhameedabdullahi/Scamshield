// On-device SHA-256 hashing for community report indicators.
// Raw phone numbers and URLs never leave the device — only hashes are stored in Firestore.

import { COMMUNITY_INDICATOR_SALT } from '../config';

async function sha256hex(str) {
  const encoded = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Hash a normalised indicator with the app salt. Returns a 64-char hex string. */
export async function hashIndicator(normalised) {
  return sha256hex(COMMUNITY_INDICATOR_SALT + ':' + normalised);
}

/** Deterministic Firestore doc ID = SHA-256(uid + ':' + indicatorHash). */
export async function reportDocId(uid, indicatorHash) {
  return sha256hex(uid + ':' + indicatorHash);
}
