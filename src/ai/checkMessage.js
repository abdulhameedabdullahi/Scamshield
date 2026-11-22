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
//       On button click (user gesture!) → downloadAndCheck(text, ...)
//
//   availability == 'unavailable' | 'unsupported'
//     → return { state: 'needs_consent', availability }
//       UI shows ConsentDialog explaining text goes to cloud
//       On consent → cloudCheck(text)   text is regex-masked before leaving device
//
// STREAMING: both onDeviceCheck and cloudCheck use generateContentStream so the
//   UI can show progress (chars received) while the model is generating.
//   The final JSON is read from streamResult.response (the aggregated result) —
//   not from the incremental chunks, which may contain partial JSON.

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

// ── parseCheckResult ───────────────────────────────────────────────────────────

/**
 * Parse and normalise the raw JSON string returned by the model.
 * Post-processing enforces two invariants:
 *   1. safe verdict → category forced to 'none', redFlags forced to []
 *   2. redFlags capped at 3 items (belt-and-suspenders; schema already limits to 3)
 *
 * @param {string} rawJson
 * @returns {{ verdict, confidence, category, redFlags, summary, advice }}
 */
export function parseCheckResult(rawJson) {
  let parsed;
  try {
    // Strip any accidental markdown code fences
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

  let { verdict, confidence, category, redFlags, summary, advice } = parsed;

  // Enforce: safe verdict must have category 'none' and no red flags
  if (verdict === 'safe') {
    category = 'none';
    redFlags = [];
  }

  // Cap redFlags at 3 (matches schema maxItems; model may ignore it)
  redFlags = Array.isArray(redFlags) ? redFlags.slice(0, 3) : [];

  return { verdict, confidence, category, redFlags, summary, advice };
}

// ── Warm-up ────────────────────────────────────────────────────────────────────

/**
 * Best-effort warm-up: creates the Chrome session and loads the model into
 * VRAM so the first real check doesn't pay that cold-start cost.
 *
 * Safe to call from useEffect (no user gesture needed) when availability is
 * already 'available' — Chrome only requires a gesture when a download would
 * be triggered, which 'available' rules out.
 *
 * Uses a plain string prompt with no schema to minimise warm-up time.
 */
export async function warmUpDeviceModel() {
  const start = Date.now();
  try {
    await onDeviceModel.generateContent('hi');
    console.log(`[ScamShield] On-device warm-up: ${Date.now() - start}ms`);
  } catch (err) {
    // Silent fail — first real check will still work (just slower).
    console.log('[ScamShield] On-device warm-up skipped:', err?.message ?? String(err));
  }
}

// ── Core check functions ───────────────────────────────────────────────────────

/**
 * Run on-device check using streaming for live progress updates.
 * Assumes the model is already downloaded (availability === 'available').
 * Also called directly by TestRunner (no onChunk needed there).
 *
 * @param {string} text - Raw message text
 * @param {(totalChars: number) => void} [onChunk] - Called with cumulative chars received
 */
export async function onDeviceCheck(text, onChunk) {
  const start = Date.now();
  const streamResult = await onDeviceModel.generateContentStream(buildRequest(text));

  let charsReceived = 0;
  for await (const chunk of streamResult.stream) {
    const chunkText = chunk.text(); // throws if model blocked — let it propagate
    charsReceived += chunkText.length;
    try { onChunk?.(charsReceived); } catch { /* ignore callback errors */ }
  }

  const raw = (await streamResult.response).text();
  const result = parseCheckResult(raw);
  return { ...result, source: 'on-device', durationMs: Date.now() - start };
}

/**
 * Regex-mask then cloud-check using streaming for live progress updates.
 * Only called after the user has explicitly consented (ConsentDialog).
 *
 * @param {string} text - Raw message text; will be masked before leaving device
 * @param {(totalChars: number) => void} [onChunk]
 */
export async function cloudCheck(text, onChunk) {
  const start = Date.now();
  const masked = regexMask(text);
  const streamResult = await cloudModel.generateContentStream(buildRequest(masked));

  let charsReceived = 0;
  for await (const chunk of streamResult.stream) {
    const chunkText = chunk.text();
    charsReceived += chunkText.length;
    try { onChunk?.(charsReceived); } catch { /* ignore callback errors */ }
  }

  const raw = (await streamResult.response).text();
  const result = parseCheckResult(raw);
  return { ...result, source: 'cloud', maskedText: masked, durationMs: Date.now() - start };
}

// ── Public routing API ─────────────────────────────────────────────────────────

/**
 * Main entry point. Checks availability, then routes to on-device or returns
 * a state token for the UI to handle.
 *
 * Returns one of:
 *   { verdict, confidence, category, redFlags, summary, advice, source, durationMs }
 *   { state: 'needs_download', availability }
 *   { state: 'needs_consent', availability }
 *
 * @param {string} text
 * @param {(totalChars: number) => void} [onChunk] - Forwarded to onDeviceCheck
 */
export async function checkMessage(text, onChunk) {
  const availability = await getOnDeviceAvailability();

  if (availability === 'available') {
    return onDeviceCheck(text, onChunk);
  }

  if (availability === 'downloadable' || availability === 'downloading') {
    return { state: 'needs_download', availability };
  }

  // 'unavailable' | 'unsupported'
  return { state: 'needs_consent', availability };
}

/**
 * Download then check in one step.
 * MUST be called from a user gesture (button click).
 *
 * @param {string} text
 * @param {(progress: number) => void} [onDownloadProgress] - 0.0 → 1.0
 * @param {(totalChars: number) => void} [onChunk]
 */
export async function downloadAndCheck(text, onDownloadProgress, onChunk) {
  await initDeviceModel(onDeviceModel, onDownloadProgress);
  return onDeviceCheck(text, onChunk);
}

/**
 * Pre-download without running a check (for the ModelStatus "Download" button).
 * MUST be called from a user gesture.
 *
 * @param {(progress: number) => void} [onProgress]
 */
export async function preloadDeviceModel(onProgress) {
  await initDeviceModel(onDeviceModel, onProgress);
}
