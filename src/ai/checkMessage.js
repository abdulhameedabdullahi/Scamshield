// Scam check: analyses a message and returns a structured verdict.
//
// Uses preferOnDeviceModel (PREFER_ON_DEVICE) so the check is:
//   - Private and offline when Gemini Nano is available
//   - Falls back to cloud automatically when it's not
//
// TODO: implement this function
//   1. Import preferOnDeviceModel from './models'
//   2. Import SCAM_CHECK_PROMPT from './prompts' and SCAM_RESULT_SCHEMA from './schemas'
//   3. Call generateContent() with the prompt + message text
//   4. Parse the JSON response and return { verdict, confidence, redFlags, advice }

/**
 * @param {string} text - The message text to check (plain text or OCR'd screenshot)
 * @returns {Promise<{ verdict: string, confidence: number, redFlags: string[], advice: string }>}
 */
export async function checkMessage(text) {
  // suppress unused-variable lint warning until this is implemented
  void text;
  throw new Error('checkMessage is not yet implemented');
}
