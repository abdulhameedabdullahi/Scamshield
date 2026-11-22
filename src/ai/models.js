// Firebase AI model instances for ScamShield.
//
// Three models are created for different hybrid inference scenarios:
//
//   onDeviceModel       — ONLY_ON_DEVICE
//     Strict on-device. Throws if Gemini Nano is not available.
//     Used for PII masking (maskMessage.js) because raw private text
//     must NEVER be sent to the cloud under any circumstances.
//
//   preferOnDeviceModel — PREFER_ON_DEVICE
//     Tries on-device first; silently falls back to cloud if unavailable.
//     Used for the scam check (checkMessage.js) where privacy is preferred
//     but a cloud fallback is acceptable when the device can't run Nano.
//
//   cloudModel          — ONLY_IN_CLOUD
//     Always uses the cloud. Used for deep investigation with Google Search
//     grounding and multi-turn chat (investigate.js).
//     IMPORTANT: Only receives masked text — never raw PII.
//
// The on-device options (expectedInputs/expectedOutputs) are verified against
// the LanguageModelCreateOptions type in @firebase/ai:
//   expectedInputs: LanguageModelExpected[] — { type: 'text'|'image'|'audio', languages? }
//   expectedOutputs: LanguageModelExpected[]
// Declaring these explicitly silences Chrome's "No output language specified" console warning.

import { getGenerativeModel, InferenceMode } from 'firebase/ai';
import { ai } from '../firebase';
import { CLOUD_MODEL } from '../config';

// Shared on-device session options — reused by both on-device model instances
const ON_DEVICE_PARAMS = {
  createOptions: {
    // Tell Chrome's Prompt API what this session will receive as input
    expectedInputs: [
      { type: 'text', languages: ['en'] }, // text messages
      { type: 'image' },                   // screenshots (JPEG/PNG, no language)
    ],
    // Tell Chrome what language the model should respond in
    expectedOutputs: [
      { type: 'text', languages: ['en'] },
    ],
  },
};

// Strict on-device model — for PII masking (must never fall back to cloud)
export const onDeviceModel = getGenerativeModel(ai, {
  mode: InferenceMode.ONLY_ON_DEVICE,
  onDeviceParams: ON_DEVICE_PARAMS,
});

// Prefer on-device model — for scam check (falls back to cloud if Nano is unavailable)
export const preferOnDeviceModel = getGenerativeModel(ai, {
  mode: InferenceMode.PREFER_ON_DEVICE,
  onDeviceParams: ON_DEVICE_PARAMS,
  // Cloud fallback config — used when Gemini Nano is not available
  inCloudParams: { model: CLOUD_MODEL },
});

// Cloud-only model — for deep investigation, Google Search grounding, and chat
export const cloudModel = getGenerativeModel(ai, {
  mode: InferenceMode.ONLY_IN_CLOUD,
  inCloudParams: { model: CLOUD_MODEL },
});
