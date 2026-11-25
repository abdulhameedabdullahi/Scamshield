// PrivacyPage — accurate plain-language disclosure of what goes online and when

export default function PrivacyPage() {
  return (
    <div className="page-scroll">
      <div className="page-content">
        <h1 style={S.h1}>What goes online and what doesn't</h1>

        <div style={S.block}>
          <h2 style={S.blockTitle}>Always stays on this phone</h2>
          <ul style={S.list}>
            <li style={S.listItem}>
              <strong>Your message text (all devices)</strong> — A rule engine runs instantly on your device and never makes any network request. On desktop Chrome 139 or newer, Gemini Nano (a local AI model built into Chrome) also reads your message on-device. Neither path sends your text anywhere at this stage.
            </li>
            <li style={S.listItem}>
              <strong>Personal detail masking</strong> — Names, account numbers, OTPs, BVN/NIN are detected and replaced with labels like [NAME_1] entirely on-device before anything is transmitted.
            </li>
            <li style={S.listItem}>
              <strong>Fingerprinting</strong> — Phone numbers and links are converted to a one-way SHA-256 hash on-device first. The raw number or link is never transmitted.
            </li>
          </ul>
        </div>

        <div style={S.block}>
          <h2 style={S.blockTitle}>How it works on your device</h2>
          <ul style={S.list}>
            <li style={S.listItem}>
              <strong>Desktop Chrome 139+ (Windows, macOS, Linux)</strong> — The rule engine runs first, then Gemini Nano (Chrome's built-in AI model) checks your message locally. No text leaves your device for the initial check. If you want a deeper analysis, you can optionally send the masked message to the cloud.
            </li>
            <li style={S.listItem}>
              <strong>All other devices (phones, tablets, other browsers)</strong> — The rule engine runs instantly on-device with no network request. For the AI check, the masked version of your message is sent to Google's Gemini service in the cloud. You review exactly what will be sent before it goes — and you can cancel at any time.
            </li>
          </ul>
        </div>

        <div style={S.block}>
          <h2 style={S.blockTitle}>What goes online and when</h2>
          <ul style={S.list}>
            <li style={S.listItem}>
              <strong>On every page load</strong> — Google reCAPTCHA Enterprise runs automatically to verify that requests come from a real browser. This is required by Firebase to protect the service from abuse. No message data is involved.
            </li>
            <li style={S.listItem}>
              <strong>After each check with a phone number or link (automatic)</strong> — An anonymous SHA-256 fingerprint of that number or link is queried in <strong>Google Firestore</strong> to check whether other ScamShield users have reported it. The raw number or link is never sent or stored. A note appears below the result when this lookup ran.
            </li>
            <li style={S.listItem}>
              <strong>Only after "Search online" (your choice)</strong> — The masked version of your message (personal details replaced with labels) is sent to <strong>Google AI (Gemini)</strong> for a deeper analysis. You review exactly what will be sent before confirming.
            </li>
            <li style={S.listItem}>
              <strong>Only after "Upload and read" (your choice)</strong> — Your screenshot is sent to <strong>Google AI (Gemini)</strong> for text extraction. Only after you explicitly confirm the upload.
            </li>
            <li style={S.listItem}>
              <strong>Only after "Report this scam" (your choice)</strong> — A report is saved to <strong>Google Firestore</strong> containing: the scam category, an anonymous SHA-256 fingerprint of the scammer's number or link, and a randomly-generated anonymous user ID. No message text is stored.
            </li>
            <li style={S.listItem}>
              <strong>When the agent checks a link (optional, within "Dig deeper")</strong> — The link may be checked against <strong>Google Safe Browsing</strong> to test whether it is flagged for phishing or malware. Any result from Safe Browsing is marked "Advisory provided by Google".
            </li>
          </ul>
        </div>

        <div style={S.note}>
          No account is needed. ScamShield does not build profiles or store message text. Anonymous user IDs are generated randomly by Firebase and are not linked to your identity. All Google services listed above operate under their standard privacy policies.
        </div>
      </div>
    </div>
  );
}

const S = {
  h1: {
    fontSize: '1.75rem',
    marginBottom: 10,
  },
  block: {
    marginBottom: 32,
  },
  blockTitle: {
    fontSize: '1.0625rem',
    fontWeight: 700,
    marginBottom: 14,
    color: 'var(--plum-900)',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  listItem: {
    fontSize: '0.9375rem',
    lineHeight: 1.6,
    color: '#444',
    paddingLeft: 20,
    borderLeft: '3px solid var(--plum-100)',
  },
  note: {
    padding: '16px 20px',
    background: 'var(--plum-100)',
    borderRadius: 'var(--r-card)',
    fontSize: '0.9375rem',
    lineHeight: 1.6,
    color: 'var(--plum-900)',
  },
};
