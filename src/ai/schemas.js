// Response schema for the scam check feature.
//
// Firebase AI Logic supports constrained JSON output via:
//   generationConfig.responseMimeType = 'application/json'
//   generationConfig.responseSchema   = <Schema instance>
//
// The Schema class and its static builders are verified against
// node_modules/@firebase/ai/dist/src/requests/schema-builder.d.ts:
//   Schema.object({ properties, optionalProperties? })
//   Schema.enumString({ enum: string[], description? })
//   Schema.array({ items: Schema, maxItems? })
//   Schema.string({ description? })
//
// SchemaParams (from schema.d.ts) supports: description, maxItems, etc.

import { Schema } from 'firebase/ai';

// All six fields are required (no optionalProperties).
export const SCAM_RESULT_SCHEMA = Schema.object({
  properties: {
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
      description: 'The specific scam category, or "none" for safe messages',
    }),
    redFlags: Schema.array({
      items: Schema.string({ description: 'A short phrase describing one red flag' }),
      maxItems: 3,
      description: 'Up to 3 red flags found in the message (empty array for safe messages)',
    }),
    summary: Schema.string({
      description: 'One short sentence explaining the verdict',
    }),
    advice: Schema.string({
      description: 'One or two plain-English sentences on what the recipient should do',
    }),
  },
});

// Pass this object directly to generateContent as `generationConfig`.
export const SCAM_CHECK_GENERATION_CONFIG = {
  responseMimeType: 'application/json',
  responseSchema: SCAM_RESULT_SCHEMA,
};
