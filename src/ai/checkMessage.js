// Scam-check core logic.
//
// ROUTING DESIGN (explicit — no silent cloud fallback):
//
//   availability == 'available'
//     → onDeviceCheck(text)   raw text stays on device, no consent needed
//
//   availability == 'downloadable' | 'downloading'
//     → return { state: 'needs_download', availability }
//       UI shows "Download private AI model" button
//       On button click (user gesture!) → downloadAndCheck(text, onProgress)
//
//   availability == 'unavailable' | 'unsupported'
//     → return { state: 'needs_consent', availability }
//       UI shows ConsentDialog explaining text goes to cloud
//       On consent → cloudCheck(text)   text is regex-masked before leaving device
//
// WHY NOT PREFER_ON_DEVICE:
//   PREFER_ON_DEVICE silently falls back when Gemini Nano is unavailable,
//   sending raw (unmasked) text to the cloud without the user's knowledge.
//   This breaks the privacy promise. Explicit routing ensures the user
//   always knows where their text goes.

import { onDeviceModel, cloudModel } from './models';
import { getOnDeviceAvailability, initDeviceModel } from './availability';
import { buildScamCheckPrompt } from './prompts';
import { SCAM_CHECK_GENERATION_CONFIG } from './schemas';
import { regexMask } from './regexMask';

// ── Shared helper ──────────────────────────────────────────────────────────────

function buildRequest(text) {
  const prompt = buildScamCheckPrompt(text);
  return {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: SCAM_CHECK_GENERATION_CONFIG,
  };
}

/**
 * Parse a raw JSON string from the model into a typed result object.
 * Throws if the JSON is malformed or missing required fields.
 * Exported for use in TestRunner.
 *
 * @param {string} rawJson
 * @returns {{ verdict: string, confidence: string, category: string, redFlags: string[], summary: string, advice: string }}
 */
export function parseCheckResult(rawJson) {
  let parsed;
  try {
    // The model may wrap JSON in markdown code fences — strip them
    const cleaned = rawJson.replace(/^```(?:json)?\n?|\n?```$/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Model returned invalid JSON: ${rawJson.slice(0, 200)}`);
  }
  const required = ['verdict', 'confidence', 'category', 'redFlags', 'summary', 'advice'];
  for (const field of required) {
    if (parsed[field] === undefined) {
      throw new Error(`Model response missing field: ${field}`);
    }
  }
  return {
    verdict: parsed.verdict,
    confidence: parsed.confidence,
    category: parsed.category,
    redFlags: Array.isArray(parsed.redFlags) ? parsed.redFlags : [],
    summary: parsed.summary,
    advice: parsed.advice,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Main entry point for the scam check flow.
 *
 * Returns one of:
 *   { verdict, confidence, category, redFlags, summary, advice, source, durationMs }
 *   { state: 'needs_download', availability }
 *   { state: 'needs_consent', availability }
 *
 * @param {string} text - Raw message text from the user
 */
export async function checkMessage(text) {
  const availability = await getOnDeviceAvailability();

  if (availability === 'available') {
    return onDeviceCheck(text);
  }

  if (availability === 'downloadable' || availability === 'downloading') {
    return { state: 'needs_download', availability };
  }

  // 'unavailable' | 'unsupported'
  return { state: 'needs_consent', availability };
}

/**
 * Run on-device check directly (no routing, no availability check).
 * Assumes the model is already downloaded (availability === 'available').
 * Also used directly by the TestRunner to bypass the routing overhead.
 *
 * @param {string} text - Raw message text
 */
export async function onDeviceCheck(text) {
  const start = Date.now();
  const response = await onDeviceModel.generateContent(buildRequest(text));
  const raw = response.response.text();
  const result = parseCheckResult(raw);
  return { ...result, source: 'on-device', durationMs: Date.now() - start };
}

/**
 * Download the on-device model then immediately run a check.
 * MUST be called from a user gesture (button click) — Chrome requires it
 * for `initializeDeviceModel()`.
 *
 * @param {string} text - Raw message text
 * @param {(progress: number) => void} [onProgress] - 0.0 → 1.0
 */
export async function downloadAndCheck(text, onProgress) {
  await initDeviceModel(onDeviceModel, onProgress);
  return onDeviceCheck(text);
}

/**
 * Pre-download the model without running a check (for the ModelStatus
 * "Download model" button which should not require a pending message).
 * MUST be called from a user gesture.
 *
 * @param {(progress: number) => void} [onProgress] - 0.0 → 1.0
 */
export async function preloadDeviceModel(onProgress) {
  await initDeviceModel(onDeviceModel, onProgress);
}

/**
 * Regex-mask the text then run the check on the cloud.
 * Only called after the user has explicitly given consent (ConsentDialog).
 *
 * @param {string} text - Raw message text; will be masked before leaving device
 */
export async function cloudCheck(text) {
  const start = Date.now();
  const masked = regexMask(text);
  const response = await cloudModel.generateContent(buildRequest(masked));
  const raw = response.response.text();
  const result = parseCheckResult(raw);
  return { ...result, source: 'cloud', maskedText: masked, durationMs: Date.now() - start };
}
