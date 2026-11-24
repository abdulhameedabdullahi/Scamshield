// App-wide constants for ScamShield.
// Centralising the cloud model name here means you only change it in one place.

export const APP_NAME = 'ScamShield';

// IMPORTANT: Verify this model name in the Firebase AI Logic docs before shipping.
// Supported models: https://firebase.google.com/docs/ai-logic/models
// Confirmed working model name as of Nov 2026 (gemini-2.0-flash-lite was retired).
export const CLOUD_MODEL = 'gemini-3.5-flash-lite';

// Static reporting tips shown for scam/suspicious verdicts.
// These are general-purpose and safe to show without AI generating them.
// TODO: add official reporting URLs once verified — no links hard-coded yet.
export const REPORTING_TIPS = [
  "Don't reply, click any links, or send money.",
  'Contact your bank through its official app or the number on the back of your card.',
  'Block and report the sender in your messaging app.',
  'Report fraud to the relevant authorities through their official websites.',
];

// Per-category static advice shown below the verdict.
// General guidance only — no organisation names, no phone numbers, no URLs.
export const ADVICE_BY_CATEGORY = {
  fake_bank_alert:
    "Legitimate bank alerts never include links or ask you to verify anything. Open your bank's official app directly to check your account.",
  account_block_or_bvn_nin:
    'Banks never restrict your account via SMS and ask you to verify BVN or NIN through a link. Contact your bank through their official app to confirm your account status.',
  otp_pin_request:
    'Nobody legitimate — including bank staff — ever needs your OTP, PIN or password. Never share these codes with anyone, through any channel.',
  job_or_loan_upfront_fee:
    'Genuine employers and legitimate lenders never require an upfront fee before a job offer or loan approval. Any request to pay first is a scam.',
  prize_or_lottery:
    'You cannot win a draw you never entered. These messages are designed to steal money or personal information.',
  impersonation:
    "Verify any official communication through the organisation's official app or website — not through contact details provided in this message.",
  investment_scheme:
    'No legitimate investment guarantees high fixed returns in a short time. Any scheme promising to double your money is fraudulent.',
  wrong_transfer_refund:
    'Check your own bank app to confirm whether any money actually arrived before taking any action. Banks can reverse genuine errors without your help.',
  romance:
    'Be cautious of people you have only met online who ask for money, gifts or personal financial details.',
  phishing_link:
    "Do not click any links in this message. Navigate to your bank or service provider's official website by typing the address yourself.",
  other:
    'Be cautious. If in doubt, do not click any links, share any codes or send any money until you have verified the message through an official channel.',
  none:
    'This message looks legitimate. Stay alert for any unexpected follow-up requests for money or codes.',
};
