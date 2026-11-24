// Response schema for the scam check feature.
//
// Field order is intentionally reasoning-first:
//   redFlags → explanation → verdict → confidence → category
// This forces Gemini Nano to cite evidence and explain before committing to a verdict,
// improving chain-of-thought consistency for small models.
//
// redFlags is now an array of objects { phrase, reason } instead of plain strings:
//   - phrase: exact text copied from the message (verified post-hoc in checkMessage.js)
//   - reason: short explanation of why that phrase is suspicious
//
// Schema.array({ items: Schema.object({...}) }) nesting is confirmed valid in
// @firebase/ai/dist/src/requests/schema-builder.d.ts:
//   Schema.array(SchemaParams & { items: Schema }) — items accepts any Schema instance.

import { Schema } from 'firebase/ai';

const RED_FLAG_ITEM = Schema.object({
  properties: {
    phrase: Schema.string({ description: 'Exact text copied from the message' }),
    reason: Schema.string({ description: 'Short reason this phrase is suspicious' }),
  },
});

export const SCAM_RESULT_SCHEMA = Schema.object({
  properties: {
    redFlags: Schema.array({
      items: RED_FLAG_ITEM,
      maxItems: 3,
      description: 'Up to 3 red flags, each with an exact phrase from the message and a short reason',
    }),
    explanation: Schema.string({
      description: 'One sentence explaining the overall verdict',
    }),
    verdict: Schema.enumString({
      enum: ['scam', 'suspicious', 'safe'],
      description: 'Overall verdict on whether the message is a scam',
    }),
    confidence: Schema.enumString({
      enum: ['low', 'medium', 'high'],
      description: 'How confident the model is in its verdict',
    }),
    category: Schema.enumString({
      enum: [
        'fake_bank_alert',
        'account_block_or_bvn_nin',
        'otp_pin_request',
        'job_or_loan_upfront_fee',
        'prize_or_lottery',
        'impersonation',
        'investment_scheme',
        'wrong_transfer_refund',
        'romance',
        'phishing_link',
        'other',
        'none',
      ],
      description: 'Specific scam category, or "none" for safe messages',
    }),
  },
});

// Pass directly to generateContent / generateContentStream as `generationConfig`.
export const SCAM_CHECK_GENERATION_CONFIG = {
  responseMimeType: 'application/json',
  responseSchema: SCAM_RESULT_SCHEMA,
};

// ── Masking schema ─────────────────────────────────────────────────────────────
// Used for the on-device AI entity-detection step in maskMessage.js.
// The model only identifies personal details regex can't catch (names, addresses, DOB).

const MASKING_ENTITY_ITEM = Schema.object({
  properties: {
    text: Schema.string({ description: 'Exact substring from the message to be masked' }),
    type: Schema.enumString({
      enum: ['person_name', 'address', 'date_of_birth', 'other_personal'],
      description: 'Category of personal information',
    }),
  },
});

export const MASKING_SCHEMA = Schema.object({
  properties: {
    entities: Schema.array({
      items: MASKING_ENTITY_ITEM,
      description: 'Personal details found in the message (excluding numbers, URLs, emails)',
    }),
  },
});

export const MASKING_GENERATION_CONFIG = {
  responseMimeType: 'application/json',
  responseSchema: MASKING_SCHEMA,
};
