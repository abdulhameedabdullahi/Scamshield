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
//   needsSecondOpinion = verdict !== 'safe'

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
    // Fallback: try to extract the first JSON object from the response
    const match = rawJson.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        console.error('[ScamShield] Raw model output (unparseable):', rawJson.slice(0, 500));
        throw new Error(`Model returned invalid JSON: ${rawJson.slice(0, 200)}`);
      }
    } else {
      console.error('[ScamShield] Raw model output (no JSON found):', rawJson.slice(0, 500));
      throw new Error(`Model returned invalid JSON: ${rawJson.slice(0, 200)}`);
    }
  }

  const required = ['verdict', 'confidence', 'category', 'redFlags'];
  for (const field of required) {
    if (parsed[field] === undefined) {
      console.error('[ScamShield] Raw model output (missing field):', rawJson.slice(0, 500));
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

  // Normalise enum fields to lowercase (model may return 'SAFE', 'SCAM', etc.)
  return {
    verdict: String(parsed.verdict ?? '').toLowerCase().trim(),
    confidence: String(parsed.confidence ?? '').toLowerCase().trim(),
    category: String(parsed.category ?? '').toLowerCase().trim(),
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

  // 7. Strong safe signal with no positive rule evidence — force safe
  // standard_alert already guards against links/credential_request before firing, so it's
  // safe to override here when no positive rule flags were found.
  const hasStrongSafe = signals.some((s) => s.id === 'do_not_share' || s.id === 'standard_alert');
  if (hasStrongSafe && ruleFlags.length === 0 && verdict !== 'safe') {
    verdict = 'safe';
    confidence = 'medium';
  }

  // 8. Safe enforcement
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

  const needsSecondOpinion = verdict !== 'safe';

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
  const request = buildRequest(text, signals);
  console.log(`[ScamShield] On-device prompt: ${request.contents[0].parts[0].text.length} chars, ${signals.length} signals`);

  async function attempt() {
    const streamResult = await onDeviceModel.generateContentStream(request);
    let charsReceived = 0;
    for await (const chunk of streamResult.stream) {
      const chunkText = chunk.text();
      charsReceived += chunkText.length;
      try { onChunk?.(charsReceived); } catch { /* ignore callback errors */ }
    }
    const raw = (await streamResult.response).text();
    const aiResult = parseCheckResult(raw);
    return applyConsistency(text, aiResult, signals, ruleScore);
  }

  let result;
  try {
    result = await attempt();
  } catch (err) {
    console.warn('[ScamShield] On-device check failed, retrying once:', err.message);
    result = await attempt();
  }

  return { ...result, source: 'on-device', signals, durationMs: Date.now() - start };
}

/**
 * Cloud-check a message. When premaskedText is supplied (from SendPreview), it is used
 * directly. Otherwise falls back to regexMask(text) so the function stays safe.
 * Only called after the user has seen and confirmed the masked text in SendPreview.
 *
 * @param {string} text - Original (raw) message text — used for signal analysis only
 * @param {(totalChars: number) => void} [onChunk] - called once with final char count
 * @param {string|null} [premaskedText] - Pre-masked text from SendPreview; skip internal masking
 */
export async function cloudCheck(text, onChunk, premaskedText = null) {
  const start = Date.now();

  // Analyze signals from original text before masking — positions are in original text
  const { signals, ruleScore } = analyzeSignals(text);
  const masked = premaskedText ?? regexMask(text);

  let raw;
  try {
    const result = await cloudModel.generateContent(buildRequest(masked, signals));
    raw = result.response.text();
    console.log('[ScamShield] Cloud response preview:', raw?.slice(0, 200));
  } catch (err) {
    // Log the exact error and any raw response payload for diagnosis
    console.error('[ScamShield] Cloud generateContent error:', err?.message ?? String(err));
    console.error('[ScamShield] Cloud error detail:', err);
    if (err?.response) {
      try {
        const errRaw = err.response.text?.();
        if (errRaw) console.error('[ScamShield] Cloud error raw response:', errRaw.slice(0, 300));
      } catch { /* response may not have a text() method in all SDK versions */ }
    }
    throw err;
  }

  const aiResult = parseCheckResult(raw);
  // Evidence check runs against masked text (what the AI saw)
  const finalResult = applyConsistency(masked, aiResult, signals, ruleScore);

  // Single callback with final char count (non-streaming)
  try { onChunk?.(raw.length); } catch { /* ignore callback errors */ }

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

/**
 * Hybrid check: on-device Rules+AI first, then cloud second-opinion for non-safe results.
 *
 * - If on-device says 'safe' → done, nothing sent to cloud. Returns sentToCloud: false.
 * - If on-device says 'scam'/'suspicious' → regexMask + cloudCheck; cloud verdict is final.
 * - Veto: on-device rules found a strong signal (credential_request, ai_instruction, or
 *   link + threat_or_block) AND cloud says safe → final verdict = suspicious.
 *
 * @param {string} text
 * @param {(totalChars: number) => void} [onChunk]
 * @returns {Promise<object>} Result with extra field sentToCloud: boolean
 */
export async function hybridCheck(text, onChunk) {
  const start = Date.now();
  const deviceResult = await onDeviceCheck(text, onChunk);

  if (deviceResult.verdict === 'safe') {
    return { ...deviceResult, sentToCloud: false };
  }

  // Identify strong on-device rule signals before escalating
  const signals = deviceResult.signals ?? [];
  const hasCredReq = signals.some((s) => s.id === 'credential_request');
  const hasAiInstr = signals.some((s) => s.id === 'ai_instruction');
  const hasLink    = signals.some((s) => s.id === 'link');
  const hasThreat  = signals.some((s) => s.id === 'threat_or_block');
  const hasStrongOnDevice = hasCredReq || hasAiInstr || (hasLink && hasThreat);

  let cloudResult;
  try {
    cloudResult = await cloudCheck(text, onChunk);
  } catch (err) {
    console.warn('[ScamShield] Hybrid cloud check failed, returning on-device result:', err?.message);
    return { ...deviceResult, sentToCloud: true, durationMs: Date.now() - start };
  }

  // Veto: strong on-device signal + cloud wrongly says safe → suspicious
  if (hasStrongOnDevice && cloudResult.verdict === 'safe') {
    return {
      ...cloudResult,
      verdict: 'suspicious',
      confidence: 'medium',
      explanation: 'On-device rule engine found strong risk signals that the cloud model did not confirm.',
      needsSecondOpinion: true,
      sentToCloud: true,
      durationMs: Date.now() - start,
    };
  }

  return { ...cloudResult, sentToCloud: true, durationMs: Date.now() - start };
}
