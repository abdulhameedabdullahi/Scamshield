// Prompt templates for ScamShield's AI features.
//
// On-device inference is single-turn — there is no persistent system instruction
// across turns. Everything must be in the user message text.
// Context limit for Gemini Nano is ~9,216 tokens, so prompts are kept compact.

/**
 * Builds the scam-check prompt for a given message.
 *
 * @param {string} messageText - The message to analyse.
 * @param {string} [scamTrends] - Optional trends string from Remote Config,
 *   injected to give the model up-to-date context (empty string = ignored).
 * @returns {string} A single prompt string ready to pass to generateContent().
 */
export function buildScamCheckPrompt(messageText, scamTrends = '') {
  const trendsSection = scamTrends.trim()
    ? `\nCURRENT SCAM TRENDS (extra context):\n${scamTrends.trim()}\n`
    : '';

  return `You are a scam analyst helping people in Nigeria check SMS, WhatsApp and email messages.

COMMON NIGERIAN SCAM PATTERNS:
- Fake bank debit/credit alerts containing login links or asking for verification
- "Your account / BVN / NIN is blocked or restricted — click link to reactivate"
- Requests for OTP, PIN, password, card details, BVN, or NIN from any source
- Job, loan, or grant offers that require upfront fees or registration payments
- Prize or lottery wins for competitions the recipient never entered
- Impersonating Nigerian banks (GTBank, Access, UBA, Zenith, FirstBank, Opay, Kuda), CBN, EFCC, FIRS, telecoms (MTN, Airtel, Glo, 9mobile), or delivery companies (DHL, GIG)
- "I sent money to your account by mistake — please refund me"
- Investment or crypto schemes promising unrealistic daily/weekly returns (doubling money)
- Links to non-official or misspelled domains (e.g. gtbank-verify.com, ubacustomerportal.net)
- Extreme urgency or threats ("account suspended in 2 hours", "legal action if no response")
${trendsSection}
LEGITIMATE MESSAGE CUES (do NOT flag these as scams):
- Real banks never ask for your PIN, OTP, password, or full card number
- Genuine debit/credit alert SMS messages do not contain login links
- An OTP message that explicitly says "do not share this code" is typically sent by the real service
- Personal messages from friends or colleagues about everyday topics are safe
- Delivery status updates that do not ask for extra payment are normal
- Work emails about meetings, schedules, or tasks are safe

IMPORTANT RULES:
- Be balanced. Not every message is a scam. Normal personal messages, genuine bank alerts with no suspicious elements, and legitimate OTP messages should be rated "safe".
- Base your verdict only on the content of the message, not on the channel.
- Use "suspicious" when there are some warning signs but the message could be legitimate.
- Use "scam" only when there are clear and specific indicators of deception.

Analyse the message below and return ONLY a JSON object — no markdown, no explanation, just the JSON.
Fields:
  verdict: "scam" | "suspicious" | "safe"
  confidence: "low" | "medium" | "high"
  category: "fake_bank_alert" | "account_block_or_bvn_nin" | "otp_pin_request" | "job_or_loan_upfront_fee" | "prize_or_lottery" | "impersonation" | "investment_scheme" | "wrong_transfer_refund" | "romance" | "phishing_link" | "other" | "none"
  redFlags: array of up to 5 short phrases (empty array [] for safe messages)
  summary: one short sentence
  advice: one or two sentences on what the recipient should do

MESSAGE:
"""
${messageText}
"""`;
}

// Placeholders for future prompts
// TODO: implement when PII masking feature is built
export const MASKING_PROMPT = null;

// TODO: implement when deep investigation feature is built
export const INVESTIGATE_PROMPT = null;
