// PII detection and masking pipeline.
//
// !! CRITICAL PRIVACY RULE !!
// This module MUST NEVER fall back to cloud inference.
// Raw private text — names, phone numbers, account numbers, BVN/NIN — must
// NEVER leave the user's device.
//
// Two-step detection:
//   Step 1 (always): regexDetect() — fast, synchronous, catches numeric PII
//   Step 2 (when available): on-device Gemini Nano — catches names, addresses, DOB
//
// The placeholder→original map stays in memory only and is NEVER sent, stored, or logged.

import { regexDetect } from './regexMask';
import { getOnDeviceAvailability } from './availability';
import { onDeviceModel } from './models';
import { buildMaskingPrompt } from './prompts';
import { MASKING_GENERATION_CONFIG } from './schemas';
import { MASK_POLICY, PLACEHOLDER_TYPES } from '../config';

/**
 * Detect personal entities in text using regex + optional on-device AI.
 * Returns entities with character positions and default mask/keep actions.
 *
 * @param {string} text - Raw message text
 * @returns {Promise<{ entities: Array, regexOnly: boolean }>}
 */
export async function detectEntities(text) {
  // Step 1: regex detection (always runs)
  const regexEntities = regexDetect(text).map((e) => ({
    ...e,
    defaultAction: MASK_POLICY[e.type] ?? 'mask',
  }));

  // Step 2: on-device AI detection (only if Nano is available)
  let regexOnly = true;
  const aiExtra = [];

  const availability = await getOnDeviceAvailability();
  if (availability === 'available') {
    try {
      const aiRaw = await detectWithAI(text);
      // Verify each AI entity exists in the original text; drop hallucinated ones
      for (const ae of aiRaw) {
        if (!ae.text || !ae.type) continue;
        const idx = text.toLowerCase().indexOf(ae.text.toLowerCase());
        if (idx === -1) continue; // hallucinated
        // Skip if already covered by a regex entity
        const overlaps = regexEntities.some((re) => re.start <= idx && idx < re.end);
        if (overlaps) continue;
        aiExtra.push({
          text: text.slice(idx, idx + ae.text.length),
          type: ae.type,
          start: idx,
          end: idx + ae.text.length,
          source: 'ai',
          defaultAction: MASK_POLICY[ae.type] ?? 'mask',
        });
      }
      regexOnly = false;
    } catch (err) {
      console.warn('[ScamShield] On-device entity detection failed, regex only:', err?.message);
    }
  }

  // Merge and sort by start position
  const all = [...regexEntities, ...aiExtra].sort((a, b) => a.start - b.start);
  return { entities: all, regexOnly };
}

/**
 * Build masked text by replacing masked entities with numbered placeholders.
 * Returns maskedText plus a placeholderMap (original values keyed by placeholder).
 * Also returns entityPlaceholders: string[] indexed by entity position in `entities`.
 *
 * IMPORTANT: placeholderMap must NEVER leave the device — it stays in memory only.
 *
 * @param {string} originalText
 * @param {Array} entities - From detectEntities()
 * @param {Object} overrides - { [entityIdx]: 'mask' | 'keep' } — user toggles
 * @returns {{ maskedText: string, placeholderMap: Object, entityPlaceholders: string[] }}
 */
export function buildMaskedText(originalText, entities, overrides = {}) {
  // Decide action for each entity
  const actions = entities.map((e, i) => overrides[i] ?? e.defaultAction ?? (MASK_POLICY[e.type] === 'mask' ? 'mask' : 'keep'));

  // Assign numbered placeholders to masked entities (sequential per type, in start order)
  const counters = {};
  const entityPlaceholders = entities.map((e, i) => {
    if (actions[i] !== 'mask') return null;
    const pKey = PLACEHOLDER_TYPES[e.type] ?? 'ITEM';
    counters[pKey] = (counters[pKey] ?? 0) + 1;
    return `[${pKey}_${counters[pKey]}]`;
  });

  // Build placeholderMap: placeholder string → original text (stays in memory only)
  const placeholderMap = {};
  entities.forEach((e, i) => {
    if (entityPlaceholders[i]) placeholderMap[entityPlaceholders[i]] = e.text;
  });

  // Build masked text: replace from end to start to preserve earlier positions
  const toReplace = entities
    .map((e, i) => ({ e, i, placeholder: entityPlaceholders[i] }))
    .filter(({ placeholder }) => placeholder !== null)
    .sort((a, b) => b.e.start - a.e.start); // descending by start

  let result = originalText;
  for (const { e, placeholder } of toReplace) {
    result = result.slice(0, e.start) + placeholder + result.slice(e.end);
  }

  return { maskedText: result, placeholderMap, entityPlaceholders };
}

/**
 * Simple masked text using regex only (backward-compat; used by cloudCheck fallback).
 * @param {string} text
 * @returns {Promise<string>}
 */
export async function maskMessage(text) {
  const { entities } = await detectEntities(text);
  const { maskedText } = buildMaskedText(text, entities);
  return maskedText;
}

// ── Internal ───────────────────────────────────────────────────────────────────

async function detectWithAI(text) {
  const prompt = buildMaskingPrompt(text);
  const request = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: MASKING_GENERATION_CONFIG,
  };
  const result = await onDeviceModel.generateContent(request);
  const raw = result.response.text();
  try {
    const cleaned = raw.replace(/^```(?:json)?\n?|\n?```$/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed.entities) ? parsed.entities : [];
  } catch {
    console.warn('[ScamShield] On-device masking JSON parse failed:', raw.slice(0, 100));
    return [];
  }
}
