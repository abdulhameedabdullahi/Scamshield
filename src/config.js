// App-wide constants for ScamShield.
// Centralising the cloud model name here means you only change it in one place.

// Which entity types to mask vs keep when sending to cloud.
// 'mask' = replaced with numbered placeholder before sending.
// 'keep' = sent as-is because the value is needed to check scam databases.
export const MASK_POLICY = {
  person_name:    'mask',
  address:        'mask',
  date_of_birth:  'mask',
  account_number: 'mask',
  bvn_nin:        'mask',
  otp_code:       'mask',
  card_number:    'mask',
  email:          'mask',
  other_personal: 'mask',
  phone_number:   'keep',
  url:            'keep',
};

// Tooltip text for 'keep' entity types shown in SendPreview.
export const MASK_POLICY_LABELS = {
  phone_number: 'Kept so we can check whether this is a known scam number.',
  url:          'Kept so we can check whether this is a known scam link.',
};

// Map entity types to placeholder prefix names.
export const PLACEHOLDER_TYPES = {
  person_name:    'NAME',
  address:        'ADDRESS',
  date_of_birth:  'DOB',
  account_number: 'ACCOUNT',
  bvn_nin:        'ID',
  otp_code:       'OTP',
  card_number:    'CARD',
  email:          'EMAIL',
  other_personal: 'PERSONAL',
  phone_number:   'PHONE',
  url:            'URL',
};

export const APP_NAME = 'ScamShield';

// Salt for SHA-256 hashing of community report indicators.
// Changing this invalidates all existing hashed records — do NOT change after deploy.
export const COMMUNITY_INDICATOR_SALT = 'scamshield-v1-indicator-salt-2024';

// ── Agent configuration ────────────────────────────────────────────────────

// TLDs frequently used in scam/phishing domains.
export const RISKY_TLDS = [
  '.tk', '.ml', '.ga', '.cf', '.gq', '.top', '.xyz', '.click',
  '.link', '.online', '.site', '.website', '.store', '.info', '.pw',
];

// Fictional brand names used in ScamShield (matches test messages).
// Used by analyze_link to detect brand-impersonation domains.
export const FICTIONAL_BRANDS = [
  'zenova', 'kora', 'halden', 'palmline', 'swiftdrop', 'novapetro',
];

// Words that combined with a brand name indicate impersonation.
export const BRAND_RISK_WORDS = [
  'verify', 'secure', 'login', 'update', 'bvn', 'reward',
  'account', 'confirm', 'validate', 'activate', 'alert', 'suspend',
];

// Known URL-shortener hostnames.
export const KNOWN_SHORTENERS = [
  'bit.ly', 'tinyurl.com', 'ow.ly', 't.co', 'goo.gl', 'short.io',
  'rebrand.ly', 'is.gd', 'tiny.cc', 'cutt.ly', 'shorturl.at',
];

// Default scam trends shown when Remote Config is unavailable.
export const SCAM_TRENDS_DEFAULT =
  'Current scam trends in Nigeria: BVN/NIN verification scams are rising. ' +
  'Fake bank debit alerts with phishing links. Investment-doubling schemes. ' +
  'Fake job offers requiring upfront registration fees. ' +
  'Impersonation of government agencies and regulatory bodies.';

// Set true to return deterministic demo data from check_community_reports
// instead of querying Firestore. Switch to false once Firestore rules are deployed.
export const USE_MOCK_REPORTS = false;

// Per-device daily cap for cloud checks (cloud AI + agent runs + cloud OCR combined).
// Stored in localStorage; resets at midnight.
export const DAILY_CLOUD_LIMIT = 15;

// Maximum tool-call steps in one agent run before forcing the final answer.
export const AGENT_MAX_STEPS = 6;

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
