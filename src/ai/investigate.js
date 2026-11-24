// Deep investigation: cloud-based analysis with Google Search grounding.
//
// Uses cloudModel (ONLY_IN_CLOUD) with Google Search so the model can search
// the web for the specific URLs, phone numbers, or patterns in the message.
//
// IMPORTANT: Only receives masked text — raw PII is never sent here.
//   Always call detectEntities() + buildMaskedText() before passing text here.
//
// Google Search grounding is enabled via tools: [{ googleSearch: {} }] in startChat.
// SDK types confirm: GoogleSearchTool = { googleSearch: {} } where googleSearch = {}
// Grounding metadata is on response.candidates[0].groundingMetadata:
//   searchEntryPoint.renderedContent — HTML/CSS snippet; must render in shadow DOM
//   groundingChunks[].web.{title, uri} — source links

import { cloudModel } from './models';
import { buildInvestigatePrompt } from './prompts';
import { regexMask } from './regexMask';

const GOOGLE_SEARCH_TOOL = { googleSearch: {} };

/**
 * Start a new investigation session.
 * Returns the first response text, grounding metadata, and the chat session object
 * which can be passed to continueInvestigation() for follow-up questions.
 *
 * @param {string} maskedText - Already-masked message text (no PII)
 * @param {{ verdict, confidence, category, explanation }} deviceVerdict
 * @param {Array<{phrase: string, reason: string}>} redFlags
 * @returns {Promise<{ session: ChatSession, text: string, groundingMetadata: object|null }>}
 */
export async function startInvestigation(maskedText, deviceVerdict, redFlags) {
  const session = cloudModel.startChat({
    tools: [GOOGLE_SEARCH_TOOL],
  });

  const prompt = buildInvestigatePrompt(maskedText, deviceVerdict, redFlags);
  const result = await retryWithBackoff(() => session.sendMessage(prompt));
  const response = result.response;

  return {
    session,
    text: response.text(),
    groundingMetadata: response.candidates?.[0]?.groundingMetadata ?? null,
  };
}

/**
 * Send a follow-up question in an existing investigation session.
 * The follow-up text is regex-masked before sending so any numbers the user
 * types are automatically protected.
 *
 * @param {ChatSession} session - Returned from startInvestigation()
 * @param {string} followUpText - User's follow-up question (will be regex-masked)
 * @returns {Promise<{ text: string, groundingMetadata: object|null, maskedFollowUp: string }>}
 */
export async function continueInvestigation(session, followUpText) {
  const maskedFollowUp = regexMask(followUpText);
  const result = await retryWithBackoff(() => session.sendMessage(maskedFollowUp));
  const response = result.response;

  return {
    text: response.text(),
    groundingMetadata: response.candidates?.[0]?.groundingMetadata ?? null,
    maskedFollowUp,
  };
}

// Exponential backoff for rate-limit errors (429 / quota exceeded).
async function retryWithBackoff(fn, maxRetries = 3) {
  let delay = 1500;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      const isRateLimit =
        err?.status === 429 ||
        err?.message?.toLowerCase().includes('429') ||
        err?.message?.toLowerCase().includes('quota') ||
        err?.message?.toLowerCase().includes('rate');
      if (!isRateLimit) throw err; // non-rate-limit errors propagate immediately
      console.warn(`[ScamShield] Rate limit hit, retrying in ${delay}ms…`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, 15000);
    }
  }
}
