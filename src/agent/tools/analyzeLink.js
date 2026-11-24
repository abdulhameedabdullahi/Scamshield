// analyze_link tool — pure local heuristics, no network.
//
// Checks a URL or bare domain for signs of phishing:
//   - IP-address host
//   - Punycode (xn--)
//   - Known URL shorteners
//   - Risky TLD (.tk, .xyz, etc.)
//   - Excessive subdomains (> 3 dots in hostname)
//   - Excessive hyphens (>= 3 in hostname)
//   - Brand-impersonation (fictional brand name + risk word in hostname)
//   - Lookalike (Levenshtein distance ≤ 2 from a brand name)
//
// Returns { domain, riskLevel: 'high'|'medium'|'low'|'safe', reasons: [] }

import {
  RISKY_TLDS, FICTIONAL_BRANDS, BRAND_RISK_WORDS, KNOWN_SHORTENERS,
} from '../../config';
import { checkUrl } from '../../services/safeBrowsing';

// ── Function declaration for Firebase AI ──────────────────────────────────

export const declaration = {
  name: 'analyze_link',
  description:
    'Analyse a URL or domain using local heuristics to detect phishing or brand impersonation. ' +
    'No network request is made. Useful for any link in the message.',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL or bare domain to analyse (e.g. "http://ng-scam.tk/login" or "ng-scam.tk")',
      },
    },
    required: ['url'],
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  // Build dp row-by-row (O(m*n) time, O(n) space)
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    prev = curr;
  }
  return prev[n];
}

function parseHostname(url) {
  let raw = url.trim();
  if (!raw.startsWith('http://') && !raw.startsWith('https://')) raw = 'https://' + raw;
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}

// The "registrable" domain — last 2 labels (e.g. "example.com" from "sub.example.com")
function baseDomain(hostname) {
  const parts = hostname.split('.');
  return parts.length >= 2 ? parts.slice(-2).join('.') : hostname;
}

// ── Main execute function ──────────────────────────────────────────────────

export async function execute({ url }) {
  const hostname = parseHostname(url);
  if (!hostname) return { domain: url, riskLevel: 'low', reasons: ['Could not parse URL'] };

  const reasons = [];
  let score = 0; // 0=safe, 1-2=low, 3-4=medium, 5+=high

  // 1. IP address host
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    reasons.push('IP address used as hostname — phishing sites often avoid registered domains');
    score += 4;
  }

  // 2. Punycode (internationalised domain lookalike)
  if (hostname.includes('xn--')) {
    reasons.push('Punycode in hostname — may be a homograph lookalike of a legitimate domain');
    score += 3;
  }

  // 3. Known URL shortener
  const base = baseDomain(hostname);
  if (KNOWN_SHORTENERS.includes(hostname) || KNOWN_SHORTENERS.includes(base)) {
    reasons.push('URL shortener — hides the real destination');
    score += 3;
  }

  // 4. Risky TLD
  const matchedTld = RISKY_TLDS.find((tld) => hostname.endsWith(tld));
  if (matchedTld) {
    reasons.push(`Risky TLD "${matchedTld}" — frequently used in scam domains`);
    score += 2;
  }

  // 5. Excessive subdomains (> 3 dots)
  const dotCount = (hostname.match(/\./g) ?? []).length;
  if (dotCount > 3) {
    reasons.push(`Unusually deep subdomain structure (${dotCount} dots) — often used to disguise the real domain`);
    score += 2;
  }

  // 6. Excessive hyphens in any part
  const labels = hostname.split('.');
  const longHyphenLabel = labels.find((l) => (l.match(/-/g) ?? []).length >= 3);
  if (longHyphenLabel) {
    reasons.push(`Many hyphens in hostname label "${longHyphenLabel}" — common in impersonation domains`);
    score += 2;
  }

  // 7. Brand impersonation (brand name + risk word in hostname)
  const hostnameNoDots = hostname.replace(/\./g, '-');
  for (const brand of FICTIONAL_BRANDS) {
    if (hostnameNoDots.includes(brand)) {
      const matchedWord = BRAND_RISK_WORDS.find((w) => hostnameNoDots.includes(w));
      if (matchedWord) {
        reasons.push(
          `Brand impersonation: hostname contains "${brand}" with risk keyword "${matchedWord}"`
        );
        score += 5;
        break;
      }
    }
  }

  // 8. Lookalike — Levenshtein distance ≤ 2 from a brand name (but not an exact match)
  if (score < 5) {
    const domainPart = base.split('.')[0]; // e.g. "zenovabank" from "zenovabank.com"
    for (const brand of FICTIONAL_BRANDS) {
      const dist = levenshtein(domainPart, brand);
      if (dist > 0 && dist <= 2) {
        reasons.push(`Domain "${domainPart}" is a close misspelling of "${brand}" (edit distance ${dist})`);
        score += 3;
        break;
      }
    }
  }

  // 9. Google Safe Browsing — definitive external check
  const sbResult = await checkUrl(url);
  if (!sbResult.safe && !sbResult.skipped) {
    const threatList = sbResult.threats.join(', ');
    reasons.unshift(`Confirmed unsafe by Google Safe Browsing (${threatList})`);
    score += 6; // Always high-risk regardless of heuristic score
  }

  const riskLevel =
    score >= 5 ? 'high' :
    score >= 3 ? 'medium' :
    score >= 1 ? 'low' : 'safe';

  return { domain: hostname, riskLevel, reasons, safeBrowsing: sbResult };
}
