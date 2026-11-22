// Prompt templates for ScamShield's AI features.
// These are placeholder exports — the actual prompts will be written
// when each feature is implemented.
//
// Good prompts for scam detection should:
// - Specify the output format (JSON schema) explicitly
// - Give context about Nigerian / West African scam patterns
// - Inject Remote Config's `scam_trends` string for up-to-date signals
// - Ask the model to reason step-by-step before giving a verdict

// TODO: Write the on-device scam check prompt.
// Should instruct the model to return structured JSON:
// { verdict, confidence, redFlags, advice }
export const SCAM_CHECK_PROMPT = null;

// TODO: Write the PII masking prompt.
// MUST use ONLY_ON_DEVICE (see maskMessage.js).
// Should replace: names, phone numbers, account numbers, emails,
// NIN/BVN numbers, addresses with generic placeholders like [NAME],
// [PHONE], [ACCOUNT], etc.
export const MASKING_PROMPT = null;

// TODO: Write the cloud investigation prompt.
// Will be used with Google Search grounding (ONLY_IN_CLOUD).
// Should search for the specific phone numbers, URLs, or patterns
// identified in the initial scam check.
export const INVESTIGATE_PROMPT = null;
