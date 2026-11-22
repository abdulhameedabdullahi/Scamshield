// Helpers for checking and initialising the on-device Gemini Nano model.
//
// Chrome exposes `window.LanguageModel` as a static global (part of the
// Prompt API). It is not a standard browser API, so we guard every access
// with an existence check to handle non-Chrome / older Chrome browsers.

/**
 * Returns the availability of the on-device language model.
 * Possible return values:
 *   'available'    – model is ready to use right now
 *   'downloadable' – model can be downloaded (Chrome will start on first use)
 *   'downloading'  – model is currently downloading
 *   'unavailable'  – Chrome supports the API but the device doesn't meet requirements
 *   'unsupported'  – browser doesn't support the Prompt API at all
 */
export async function getOnDeviceAvailability() {
  if (typeof window.LanguageModel === 'undefined') {
    return 'unsupported';
  }
  try {
    // LanguageModel.availability() is a static method on the Chrome Prompt API.
    // It optionally accepts a LanguageModelCreateOptions object to check for
    // specific capabilities (e.g., a particular language). We pass none here
    // for a general availability check.
    return await window.LanguageModel.availability();
  } catch (err) {
    console.warn('[ScamShield] LanguageModel.availability() failed:', err);
    return 'unsupported';
  }
}

/**
 * Triggers the on-device model download / session creation.
 *
 * IMPORTANT: This must be called on or after a user gesture (button click,
 * key press, etc.). Calling it without a user interaction will cause an error
 * in Chrome if a download is required.
 *
 * @param {import('firebase/ai').GenerativeModel} model - A Firebase AI model instance
 * @param {(progress: number) => void} [onProgress] - Called with 0–1 as the
 *   download progresses. Chrome may fire this multiple times at 1.0.
 */
export async function initDeviceModel(model, onProgress) {
  await model.initializeDeviceModel(onProgress);
}
