// AboutPage — one paragraph + hackathon credit

export default function AboutPage() {
  return (
    <div className="page-scroll">
      <div className="page-content">
        <h1 style={S.h1}>About ScamShield</h1>

        <p style={S.body}>
          ScamShield helps everyday people in Nigeria check suspicious SMS, WhatsApp and email
          messages before trusting them. It runs a small AI model directly on your phone, so your
          message is never uploaded unless you explicitly choose to search online — and even then,
          personal details are hidden first. The goal is to give anyone access to the kind of
          careful second opinion that a trusted, tech-savvy friend would give.
        </p>

        <p style={{ ...S.body, marginTop: 16 }}>
          ScamShield focuses on Nigerian scam patterns: fake bank debit alerts, BVN/NIN
          verification threats, OTP phishing, fake job offers with upfront fees, lottery scams,
          impersonation of government agencies, and investment-doubling schemes.
        </p>

        <div style={S.credit}>
          <div style={S.creditTitle}>Built for</div>
          <p style={S.creditBody}>
            Firebase #BuildHybridAI Hackathon on Devpost (2026).
            Uses Firebase AI Logic (Gemini Nano on-device + Gemini cloud), App Check,
            Firestore, and Firebase Remote Config.
          </p>
        </div>

        <div style={S.license}>
          Open source · Apache 2.0 licence
        </div>
      </div>
    </div>
  );
}

const S = {
  h1: {
    fontSize: '1.75rem',
    marginBottom: 16,
  },
  body: {
    fontSize: '1.0625rem',
    lineHeight: 1.65,
    color: '#333',
  },
  credit: {
    marginTop: 36,
    padding: '16px 20px',
    background: 'var(--plum-100)',
    borderRadius: 12,
  },
  creditTitle: {
    fontSize: '0.8125rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--plum-700)',
    marginBottom: 6,
  },
  creditBody: {
    fontSize: '0.9375rem',
    lineHeight: 1.6,
    color: 'var(--plum-900)',
  },
  license: {
    marginTop: 24,
    fontSize: '0.875rem',
    color: '#888',
  },
};
