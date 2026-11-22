// JSON response schema definitions for ScamShield's AI outputs.
// Firebase AI Logic supports constrained JSON output via responseSchema in
// GenerationConfig. These will be passed to generateContent() calls.
//
// Schema builder docs:
// https://firebase.google.com/docs/ai-logic/structured-output

// TODO: Define the scam check result schema using Firebase AI Logic's Schema builder.
// Shape:
// {
//   verdict:    'SCAM' | 'LIKELY_SCAM' | 'SUSPICIOUS' | 'LIKELY_SAFE' | 'SAFE',
//   confidence: 0.0 – 1.0,
//   redFlags:   string[],   // e.g. ["Requests BVN", "Fake bank name"]
//   advice:     string      // Plain-English advice for the user
// }
export const SCAM_RESULT_SCHEMA = null;
