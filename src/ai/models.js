// Firebase AI model instances for ScamShield.
//
// Two models with explicit routing — PREFER_ON_DEVICE was intentionally removed
// because it silently sends raw (unmasked) text to the cloud when Gemini Nano is
// unavailable, breaking the app's privacy promise.  Instead, checkMessage.js
// implements explicit routing: it checks availability and gates the cloud path
// behind a user consent dialog so the user always knows where their text goes.
//
//   onDeviceModel  — ONLY_ON_DEVICE
//     Strict on-device. Throws if Gemini Nano is not available.
//     Used for the scam check (on-device path) and PII masking.
//     Raw private text MUST NEVER be sent to the cloud under any circumstances.
//
//   cloudModel     — ONLY_IN_CLOUD
//     Always uses the cloud. Used as the cloud path in the scam check and
//     for future deep investigation features.
//     IMPORTANT: Only receives regex-masked text — never raw PII.
//
// The on-device options (expectedInputs/expectedOutputs) are verified against
// the LanguageModelCreateOptions type in @firebase/ai:
//   expectedInputs: LanguageModelExpected[] — { type: 'text'|'image'|'audio', languages? }
//   expectedOutputs: LanguageModelExpected[]
// Declaring these explicitly silences Chrome's "No output language specified" warning.

import { getGenerativeModel, InferenceMode } from 'firebase/ai';
import { ai } from '../firebase';
import { CLOUD_MODEL } from '../config';

// Shared on-device session options
const ON_DEVICE_PARAMS = {
  createOptions: {
    expectedInputs: [
      { type: 'text', languages: ['en'] },
      { type: 'image' },
    ],
    expectedOutputs: [
      { type: 'text', languages: ['en'] },
    ],
  },
};

// Strict on-device — for scam check (on-device path) and PII masking
export const onDeviceModel = getGenerativeModel(ai, {
  mode: InferenceMode.ONLY_ON_DEVICE,
  onDeviceParams: ON_DEVICE_PARAMS,
});

// Cloud-only — for the consent-gated cloud scam check and future deep investigation
export const cloudModel = getGenerativeModel(ai, {
  mode: InferenceMode.ONLY_IN_CLOUD,
  inCloudParams: { model: CLOUD_MODEL },
});
