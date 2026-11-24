// search_web tool — Google Search grounded cloud call.
//
// IMPORTANT: Google Search grounding CANNOT be combined with functionDeclarations
// in the same request (confirmed from @firebase/ai typings: Tool is a union type —
// each request uses either functionDeclarations OR googleSearch, not both).
// So search_web is a local tool: when the agent calls it, we make a SEPARATE
// generateContent call with { googleSearch: {} } and return the summary + sources.
//
// Only the masked message context is included in the query — no raw PII.

import { cloudModel } from '../../ai/models';

const GOOGLE_SEARCH_TOOL = { googleSearch: {} };
const MAX_SUMMARY_WORDS = 60;

// ── Function declaration for Firebase AI ──────────────────────────────────

export const declaration = {
  name: 'search_web',
  description:
    'Search the web using Google Search to find information about a scam pattern, ' +
    'suspicious domain, phone number, or technique. Returns a brief summary and sources. ' +
    'Use for domains or phone numbers you need to verify, or to look up known scam patterns.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query. Keep it concise and focused (e.g. "ng-scam.tk phishing Nigeria").',
      },
    },
    required: ['query'],
  },
};

// ── Execute ────────────────────────────────────────────────────────────────

export async function execute({ query }) {
  const result = await cloudModel.generateContent({
    contents: [{
      role: 'user',
      parts: [{
        text:
          `You are a scam research assistant. Search the web and answer this query in at most ${MAX_SUMMARY_WORDS} words, citing only what your search found. ` +
          `Query: "${query}"`,
      }],
    }],
    tools: [GOOGLE_SEARCH_TOOL],
  });

  const response = result.response;
  const rawSummary = response.text();
  // Truncate to word limit
  const words = rawSummary.split(/\s+/);
  const summary = words.length > MAX_SUMMARY_WORDS
    ? words.slice(0, MAX_SUMMARY_WORDS).join(' ') + '…'
    : rawSummary;

  const groundingMeta = response.candidates?.[0]?.groundingMetadata ?? null;
  const sources = (groundingMeta?.groundingChunks ?? [])
    .map((c) => c.web)
    .filter((w) => w?.uri)
    .map(({ title, uri }) => ({ title: title ?? uri, uri }));

  const renderedContent = groundingMeta?.searchEntryPoint?.renderedContent ?? null;

  return { summary, sources, renderedContent };
}
