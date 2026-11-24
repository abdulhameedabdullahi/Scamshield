// Google Safe Browsing v4 Lookup API.
//
// Requires VITE_SAFE_BROWSING_API_KEY in .env.local.
// If the key is absent the function returns { safe: true, skipped: true } so the
// rest of the analyzeLink pipeline continues without throwing.
//
// Free tier: 10 000 lookups / day — plenty for a community scam-checker.
// Docs: https://developers.google.com/safe-browsing/v4/lookup-api

const API_KEY = import.meta.env.VITE_SAFE_BROWSING_API_KEY;
const ENDPOINT = 'https://safebrowsing.googleapis.com/v4/threatMatches:find';

const THREAT_TYPES = [
  'MALWARE',
  'SOCIAL_ENGINEERING',
  'UNWANTED_SOFTWARE',
  'POTENTIALLY_HARMFUL_APPLICATION',
];

/**
 * Check a single URL against Google Safe Browsing.
 *
 * @param {string} url
 * @returns {Promise<{ safe: boolean, threats: string[], skipped?: boolean, error?: string }>}
 */
export async function checkUrl(url) {
  if (!API_KEY) return { safe: true, threats: [], skipped: true };

  const body = {
    client: { clientId: 'scamshield', clientVersion: '1.0.0' },
    threatInfo: {
      threatTypes: THREAT_TYPES,
      platformTypes: ['ANY_PLATFORM'],
      threatEntryTypes: ['URL'],
      threatEntries: [{ url }],
    },
  };

  try {
    const res = await fetch(`${ENDPOINT}?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) return { safe: true, threats: [], error: `HTTP ${res.status}` };

    const data = await res.json();
    const threats = (data.matches ?? []).map((m) => m.threatType);
    return { safe: threats.length === 0, threats };
  } catch (err) {
    console.warn('[ScamShield] Safe Browsing lookup failed:', err?.message);
    return { safe: true, threats: [], error: err?.message };
  }
}
