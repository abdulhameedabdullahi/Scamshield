// Deep investigation: cloud-based analysis with Google Search grounding.
//
// Uses cloudModel (ONLY_IN_CLOUD) with Google Search as a tool so the model
// can search the web for the specific numbers, URLs, or patterns in the message.
//
// IMPORTANT: Only receives masked text — raw PII is never sent here.
//   Always call maskMessage() before passing text to this function.
//
// TODO: implement this function
//   1. Import cloudModel from './models'
//   2. Import INVESTIGATE_PROMPT from './prompts'
//   3. Add GoogleSearchTool to the model or request tools config
//   4. Call generateContent() with grounding enabled
//   5. Return evidence text + grounding metadata (source URLs)
//   6. For multi-turn chat: use cloudModel.startChat() and export the session

/**
 * @param {string} maskedText - Already-masked message text (no PII)
 * @returns {Promise<{ evidence: string, sources: string[] }>}
 */
export async function investigate(maskedText) {
  void maskedText;
  throw new Error('investigate is not yet implemented');
}
