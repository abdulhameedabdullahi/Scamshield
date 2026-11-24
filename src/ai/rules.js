// Rule-based signal detection for scam messages.
// Pure synchronous JS — no AI, no imports, no async.
//
// Returns { signals, ruleScore } where:
//   signals  = Array of { id, label, phrase, start, end, weight }
//   ruleScore = sum of all signal weights (positive = risky, negative = safe)
//
// Positive signals indicate risk; negative signals are safe cues that lower the score.

const RULES = [
  // ── Risk signals ────────────────────────────────────────────────────────────────

  {
    id: 'link',
    label: 'Suspicious link',
    weight: 3,
    // Matches http/https URLs and www. prefixed domains
    pattern: /https?:\/\/[^\s<>"]+|www\.[^\s<>"]+/,
  },
  {
    id: 'credential_request',
    label: 'Requests sensitive credential',
    weight: 4,
    // "share/send/give/tell/forward" near otp/code/pin/password/bvn/nin/cvv/token
    // "enter/provide/type/input" near otp/pin/password/bvn/nin/cvv
    // Post-filtered in analyzeSignals to exclude protective "do not share" phrasing.
    pattern: /\b(share|send|give|tell|forward)\b.{0,30}\b(otp|code|pin|password|bvn|nin|cvv|token)\b|\b(enter|provide|type|input|submit)\b.{0,30}\b(otp|pin|password|bvn|nin|cvv)\b/,
  },
  {
    id: 'payment_request',
    label: 'Requests payment or transfer',
    weight: 3,
    // Upfront fee patterns; pay/transfer near a money amount; "send it back"
    pattern: /\b(processing|registration|application|clearance|activation)\s+fee\b|\bpay\b.{0,25}\b(ngn|n\d|₦|\d{3,})\b|\b(transfer|send)\s+(it|them|back|the\s+money|ngn|n\d|\d{3,})/,
  },
  {
    id: 'account_number',
    label: 'Contains bare account number',
    weight: 1,
    // 10-digit Nigerian account numbers (not masked — masked format is caught separately)
    pattern: /\b\d{10}\b/,
  },
  {
    id: 'phone_number',
    label: 'Contains Nigerian phone number',
    weight: 1,
    // 0[789]XXXXXXXXX (11 digits) or +234[789]XXXXXXXXX
    pattern: /(?:\+?234|0)[789]\d{9}/,
  },
  {
    id: 'urgency',
    label: 'Creates urgency',
    weight: 2,
    pattern: /\b(urgent(?:ly)?|immediately|right\s+now|asap)\b|within\s+\d+\s+(minute|hour|min|hr)s?|before\s+(midnight|11:59|today\b|it\s+(?:is\s+)?too\s+late)|expire[sd]?\s+(today|soon|now)/,
  },
  {
    id: 'threat_or_block',
    label: 'Threatens account suspension or block',
    weight: 2,
    // Also catches Pidgin "don block" via "block" match
    pattern: /\b(blocked?|suspended?|suspension|restricted|deactivated?|terminated|permanently\s+(block|suspend|restrict|deactivate)|lose\s+(access|your\s+account))\b/,
  },
  {
    id: 'prize_or_offer',
    label: 'Prize or unsolicited offer',
    weight: 2,
    pattern: /\b(congratulations?|you\s+have\s+won|you['’]ve\s+won|shortlisted|selected\s+for\s+a|grand\s+prize|lottery|reward\s+promo|double\s+your\s+money|free\s+(money|airtime|data))\b/,
  },
  {
    id: 'impersonation',
    label: 'Claims official identity',
    weight: 3,
    pattern: /\b(customer\s+care|national\s+revenue\s+office|federal\s+crimes\s+bureau|federal\s+recruitment\s+board|bank\s+verification\s+(number|unit)|federal\s+government\s+(recruitment|scheme|grant)|national\s+customs)\b/,
  },
  {
    id: 'ai_instruction',
    label: 'Contains prompt injection attempt',
    weight: 5,
    // Phrases targeting automated classifiers embedded in the message being checked
    pattern: /\b(note\s+to\s+(ai|assistant|classifier|model|bot)|classify\s+(this|it)\s+as|ignore\s+(previous|prior|all)\s+instructions?|mark\s+(this\s+)?as\s+safe|this\s+message\s+is\s+(safe|from\s+a\s+verified)|disregard\s+(?:the\s+)?(?:above|previous)|you\s+(are\s+an?|must\s+classify))\b/,
  },

  // ── Safe cues (negative weight) ─────────────────────────────────────────────────

  {
    id: 'do_not_share',
    label: 'Legitimate do-not-share warning',
    weight: -4,
    // Also covers "will never ask you to share/send" (not just "ask you FOR")
    pattern: /do\s+not\s+share\s+this\s+(code|otp|pin|password)|never\s+share\s+(this|your)\s+(otp|code|pin|password)|(will\s+)?never\s+ask\s+(you\s+)?(?:for\s+|to\s+(?:share|send|give)\s+)(?:your\s+|this\s+)?(otp|code|pin|password|token)/,
  },
  {
    id: 'masked_account',
    label: 'Contains masked account number',
    weight: -3,
    // Formats: ****3309 or 1234****
    pattern: /\*{2,}\d{3,}|\d{3,}\*{2,}/,
  },
];

/**
 * Analyse a message string and return all detected signals.
 *
 * @param {string} text
 * @returns {{ signals: Array<{id, label, phrase, start, end, weight}>, ruleScore: number }}
 */
export function analyzeSignals(text) {
  const signals = [];

  for (const rule of RULES) {
    // Reconstruct regex with 'gi' flags each call — avoids stale lastIndex from 'g' flag
    const r = new RegExp(rule.pattern.source, 'gi');
    let m;
    while ((m = r.exec(text)) !== null) {
      signals.push({
        id: rule.id,
        label: rule.label,
        phrase: m[0],
        start: m.index,
        end: m.index + m[0].length,
        weight: rule.weight,
      });
    }
  }

  // Standard bank alert: compound safe signal — only added when no link or credential
  // request was found (a real alert doesn't ask you to click or share anything)
  const hasLink = signals.some((s) => s.id === 'link');
  const hasCred = signals.some((s) => s.id === 'credential_request');
  if (!hasLink && !hasCred && isStandardAlertFormat(text)) {
    signals.push({
      id: 'standard_alert',
      label: 'Standard bank alert format',
      phrase: '',
      start: -1,
      end: -1,
      weight: -2,
    });
  }

  // credential_request post-filter: drop matches where a protective negation
  // appears within the same clause before the share/send verb.
  // Uses sentence-boundary detection so "has never been safer. Share your code"
  // is NOT suppressed (negation is in a prior sentence).
  const filtered = signals.filter((s) => {
    if (s.id !== 'credential_request') return true;
    // Take up to 60 chars before the matched verb position
    const before60 = text.slice(Math.max(0, s.start - 60), s.start);
    // Find the last sentence boundary inside that window
    const lastBoundary = Math.max(
      before60.lastIndexOf('.'),
      before60.lastIndexOf('!'),
      before60.lastIndexOf('?'),
      -1,
    );
    // The clause is everything after that boundary (i.e. same sentence as the verb)
    const clauseBefore = before60.slice(lastBoundary + 1).toLowerCase();
    // If a negation word appears within ~6 words before the verb, it's protective
    return !/(do\s+not|don'?t|never|will\s+never|no\s+one\s+will|nobody\s+should|not\s+ask)\b/.test(clauseBefore);
  });

  const ruleScore = filtered.reduce((sum, s) => sum + s.weight, 0);
  return { signals: filtered, ruleScore };
}

function isStandardAlertFormat(text) {
  const hasDebitCredit = /\b(Debit|Credit)\s+of\b/i.test(text);
  const hasAcctAndBal = /\bAcct\b/i.test(text) && /\bBal\b/i.test(text);
  const hasAmount = /\bN(?:GN)?\s*[\d,.]+/i.test(text);
  return (hasDebitCredit || hasAcctAndBal) && hasAmount;
}
