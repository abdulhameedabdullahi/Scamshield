// Dev-only baseline checker — on-device model with NO rule engine, NO few-shot
// examples, and NO post-processing/consistency logic.
// Used by TestRunner to compare the pure-AI approach against the full pipeline.

import { onDeviceModel } from '../ai/models';
import { SCAM_CHECK_GENERATION_CONFIG } from '../ai/schemas';
import { parseCheckResult } from '../ai/checkMessage';

function buildBaselinePrompt(text) {
  return `You are a scam-detection classifier for messages received in Nigeria.

Return JSON with fields in order: redFlags (array of {phrase, reason}), explanation, verdict, confidence, category.
- Most everyday messages are SAFE. Only mark scam/suspicious when there is clear evidence.
- Safe verdict MUST have redFlags:[] and category:"none".
- phrase in each redFlag MUST be copied exactly from the message.

MESSAGE:
"""
${text}
"""

Return ONLY valid JSON.`;
}

/**
 * Run on-device inference with the simplest possible prompt.
 * No rule signals injected, no few-shot examples, no post-processing.
 */
export async function aiOnlyCheck(text, onChunk) {
  const start = Date.now();
  const streamResult = await onDeviceModel.generateContentStream({
    contents: [{ role: 'user', parts: [{ text: buildBaselinePrompt(text) }] }],
    generationConfig: SCAM_CHECK_GENERATION_CONFIG,
  });

  let charsReceived = 0;
  for await (const chunk of streamResult.stream) {
    charsReceived += chunk.text().length;
    try { onChunk?.(charsReceived); } catch { /* ignore callback errors */ }
  }

  const raw = (await streamResult.response).text();
  // parseCheckResult normalises the JSON only — applyConsistency is intentionally skipped
  const result = parseCheckResult(raw);
  return { ...result, source: 'on-device', signals: [], durationMs: Date.now() - start };
}
