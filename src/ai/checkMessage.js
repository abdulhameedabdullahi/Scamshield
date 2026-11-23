// Scam-check core logic — session 5 redesign: RULES + AI.
//
// FLOW:
//   1. analyzeSignals(text)   — pure-JS rule engine; identifies risk signals and safe cues
//   2. buildRequest()         — builds the prompt with signal context injected
//   3. generateContentStream  — AI reasoning; schema enforces redFlags/explanation before verdict
//   4. parseCheckResult()     — parse & normalize raw JSON
//   5. applyConsistency()     — evidence check (drop hallucinated phrases) + verdict overrides
//
// ROUTING DESIGN (explicit — no silent cloud fallback):
//   availability == 'available'
//     → onDeviceCheck(text)   raw text stays on device, no consent needed
//   availability == 'downloadable' | 'downloading'
//     → return { state: 'needs_download', availability }
//   availability == 'unavailable' | 'unsupported'
//     → return { state: 'needs_consent', availability }
//       On consent → cloudCheck(text)   text is regex-masked before leaving device
//
// RETURN SHAPE (from onDeviceCheck / cloudCheck):
//   { verdict, confidence, category, redFlags, explanation, signals,
//     source, durationMs, needsSecondOpinion, maskedText? }
//
//   redFlags = Array of { phrase, reason, source: 'ai'|'rule', start, end }
//   needsSecondOpinion = verdict === 'suspicious' || confidence === 'low'

import { onDeviceModel, cloudModel } from './models';
import { getOnDeviceAvailability, initDeviceModel } from './availability';
import { buildScamCheckPrompt } from './prompts';
import { SCAM_CHECK_GENERATION_CONFIG } from './schemas';
import { regexMask } from './regexMask';
import { analyzeSignals } from './rules';

// ── Shared helper ──────────────────────────────────────────────────────────────

function buildRequest(text, signals) {
  const prompt = buildScamCheckPrompt(text, signals);
  return {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: SCAM_CHECK_GENERATION_CONFIG,
  };
}

// ── parseCheckResult ───────────────────────────────────────────────────────────

/**
 * Parse and normalise the raw JSON string returned by the model.
 * Handles both old (string[]) and new ({phrase,reason}[]) redFlags formats.
 *
 * @param {string} rawJson
 * @returns {{ verdict, confidence, category, redFlags, explanation }}
 */
export function parseCheckResult(rawJson) {
  let parsed;
  try {
    const cleaned = rawJson.replace(/^```(?:json)?\n?|\n?```$/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Model returned invalid JSON: ${rawJson.slice(0, 200)}`);
  }

  const required = ['verdict', 'confidence', 'category', 'redFlags'];
  for (const field of required) {
    if (parsed[field] === undefined) {
      throw new Error(`Model response missing field: ${field}`);
    }
  }

  // Normalise redFlags: accept both old string[] and new {phrase,reason}[] formats
  let redFlags = Array.isArray(parsed.redFlags) ? parsed.redFlags : [];
  redFlags = redFlags
    .map((f) => {
      if (typeof f === 'string') return { phrase: f, reason: '' };
      return { phrase: String(f.phrase ?? ''), reason: String(f.reason ?? '') };
    })
    .filter((f) => f.phrase.trim().length > 0);

  // explanation may be missing in some model responses; fall back to empty string
  const explanation = String(parsed.explanation ?? parsed.summary ?? '');

  return {
    verdict: parsed.verdict,
    confidence: parsed.confidence,
    category: parsed.category,
    redFlags,
    explanation,
  };
}

// ── applyConsistency ───────────────────────────────────────────────────────────

/**
 * Post-processing that:
 *   1. Verifies AI red flags exist in the analyzed text (drops hallucinated phrases)
 *   2. Merges rule signals as additional red flags (deduplicated)
 *   3. Applies verdict overrides: prompt injection, hallucinated scam, strong rules ignored
 *   4. Enforces safe invariants
 *
 * @param {string} analyzedText - Text the AI actually saw (original for on-device; masked for cloud)
 * @param {{ verdict, confidence, category, redFlags, explanation }} aiResult
 * @param {Array} signals - From analyzeSignals()
 * @param {number} ruleScore
 * @returns {{ verdict, confidence, category, redFlags, explanation, needsSecondOpinion }}
 */
function applyConsistency(analyzedText, aiResult, signals, ruleScore) {
  let { verdict, confidence, category, redFlags, explanation } = aiResult;

  // 1. Verify AI flags: phrase must actually exist in analyzed text
  const verifiedAiFlags = redFlags
    .map((f) => {
      const idx = analyzedText.toLowerCase().indexOf(f.phrase.toLowerCase());
      if (idx === -1) return null; // hallucinated — drop it
      return { ...f, source: 'ai', start: idx, end: idx + f.phrase.length };
    })
    .filter(Boolean);

  // 2. Build rule flags from risk signals (positive weight, with a phrase)
  const ruleFlags = signals
    .filter((s) => s.weight > 0 && s.start >= 0 && s.phrase)
    .map((s) => ({
      phrase: s.phrase,
      reason: s.label,
      source: 'rule',
      start: s.start,
      end: s.end,
    }));

  // 3. Merge: AI flags first, then rule flags that don't overlap with any AI flag
  const merged = [...verifiedAiFlags];
  for (const rf of ruleFlags) {
    const overlaps = verifiedAiFlags.some(
      (af) => af.start < rf.end && rf.start < af.end
    );
    if (!overlaps) merged.push(rf);
  }
  let mergedFlags = merged.slice(0, 3);

  // 4. Prompt injection override — if the message contains instructions targeting the AI
  const injectionSig = signals.find((s) => s.id === 'ai_instruction');
  if (injectionSig) {
    if (verdict === 'safe') {
      verdict = 'suspicious';
      confidence = confidence === 'high' ? 'medium' : confidence;
    }
    // Ensure the injection phrase is surfaced as a red flag
    const alreadyFlagged = mergedFlags.some((f) => f.start === injectionSig.start);
    if (!alreadyFlagged) {
      const injFlag = {
        phrase: injectionSig.phrase,
        reason: 'Contains instructions targeting automated classifiers',
        source: 'rule',
        start: injectionSig.start,
        end: injectionSig.end,
      };
      mergedFlags = [injFlag, ...mergedFlags].slice(0, 3);
    }
  }

  // 5. Downgrade: AI claims scam but no evidence at all and rules are quiet
  if (verdict === 'scam' && mergedFlags.length === 0 && ruleScore < 2) {
    verdict = 'suspicious';
    confidence = 'low';
  }

  // 6. Upgrade: AI says safe but rule engine found strong multiple risk signals with no evidence from AI
  if (verdict === 'safe' && verifiedAiFlags.length === 0 && ruleFlags.length >= 2 && ruleScore >= 6) {
    verdict = 'suspicious';
    confidence = 'low';
    // Seed flags with the top rule signals
    mergedFlags = ruleFlags.slice(0, 3);
  }

  // 7. Safe enforcement
  if (verdict === 'safe') {
    return {
      verdict,
      confidence,
      category: 'none',
      redFlags: [],
      explanation,
      needsSecondOpinion: false,
    };
  }

  const needsSecondOpinion = verdict === 'suspicious' || confidence === 'low';

  return {
    verdict,
    confidence,
    category,
    redFlags: mergedFlags,
    explanation,
    needsSecondOpinion,
  };
}

// ── Warm-up ────────────────────────────────────────────────────────────────────

/**
 * Best-effort warm-up: creates the Chrome session and loads the model into
 * VRAM so the first real check doesn't pay that cold-start cost.
 * Safe to call from useEffect — no user gesture needed when availability is 'available'.
 */
export async function warmUpDeviceModel() {
  const start = Date.now();
  try {
    await onDeviceModel.generateContent('hi');
    console.log(`[ScamShield] On-device warm-up: ${Date.now() - start}ms`);
  } catch (err) {
    console.log('[ScamShield] On-device warm-up skipped:', err?.message ?? String(err));
  }
}

// ── Core check functions ───────────────────────────────────────────────────────

/**
 * Run on-device check using streaming for live progress updates.
 * Assumes the model is already downloaded (availability === 'available').
 *
 * @param {string} text - Raw message text
 * @param {(totalChars: number) => void} [onChunk]
 */
export async function onDeviceCheck(text, onChunk) {
  const start = Date.now();

  const { signals, ruleScore } = analyzeSignals(text);
  const streamResult = await onDeviceModel.generateContentStream(buildRequest(text, signals));

  let charsReceived = 0;
  for await (const chunk of streamResult.stream) {
    const chunkText = chunk.text();
    charsReceived += chunkText.length;
    try { onChunk?.(charsReceived); } catch { /* ignore callback errors */ }
  }

  const raw = (await streamResult.response).text();
  const aiResult = parseCheckResult(raw);
  const finalResult = applyConsistency(text, aiResult, signals, ruleScore);

  return {
    ...finalResult,
    source: 'on-device',
    signals,
    durationMs: Date.now() - start,
  };
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

  // Analyze signals from original text before masking — positions are in original text
  const { signals, ruleScore } = analyzeSignals(text);
  const masked = regexMask(text);

  const streamResult = await cloudModel.generateContentStream(buildRequest(masked, signals));

  let charsReceived = 0;
  for await (const chunk of streamResult.stream) {
    const chunkText = chunk.text();
    charsReceived += chunkText.length;
    try { onChunk?.(charsReceived); } catch { /* ignore callback errors */ }
  }

  const raw = (await streamResult.response).text();
  const aiResult = parseCheckResult(raw);
  // Evidence check runs against masked text (what the AI saw)
  const finalResult = applyConsistency(masked, aiResult, signals, ruleScore);

  return {
    ...finalResult,
    source: 'cloud',
    maskedText: masked,
    signals,
    durationMs: Date.now() - start,
  };
}

// ── Public routing API ─────────────────────────────────────────────────────────

/**
 * Main entry point. Checks availability, then routes to on-device or returns
 * a state token for the UI to handle.
 *
 * Returns one of:
 *   { verdict, confidence, category, redFlags, explanation, signals, source, durationMs, needsSecondOpinion }
 *   { state: 'needs_download', availability }
 *   { state: 'needs_consent', availability }
 *
 * @param {string} text
 * @param {(totalChars: number) => void} [onChunk]
 */
export async function checkMessage(text, onChunk) {
  const availability = await getOnDeviceAvailability();

  if (availability === 'available') {
    return onDeviceCheck(text, onChunk);
  }

  if (availability === 'downloadable' || availability === 'downloading') {
    return { state: 'needs_download', availability };
  }

  return { state: 'needs_consent', availability };
}

/**
 * Download then check in one step.
 * MUST be called from a user gesture (button click).
 */
export async function downloadAndCheck(text, onDownloadProgress, onChunk) {
  await initDeviceModel(onDeviceModel, onDownloadProgress);
  return onDeviceCheck(text, onChunk);
}

/**
 * Pre-download without running a check (for the ModelStatus "Download" button).
 * MUST be called from a user gesture.
 */
export async function preloadDeviceModel(onProgress) {
  await initDeviceModel(onDeviceModel, onProgress);
}
