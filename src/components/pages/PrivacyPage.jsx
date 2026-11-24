// PrivacyPage — plain-language 3-step privacy explainer

import { Lock, Smartphone, Search } from 'lucide-react';

export default function PrivacyPage() {
  return (
    <div className="page-scroll">
      <div className="page-content">
        <h1 style={S.h1}>How your privacy is protected</h1>
        <p style={S.lead}>
          Your message never goes anywhere without your knowledge. Here is exactly what happens.
        </p>

        <div style={S.steps}>
          <Step
            icon={<Smartphone size={28} color="var(--plum-700)" strokeWidth={1.75} />}
            number="1"
            title="Checked on your phone first"
            body="When you paste a message, ScamShield reads it using a small AI model that runs directly on your phone — not on any server. Your message is never uploaded at this stage."
          />
          <div style={S.connector} aria-hidden="true" />
          <Step
            icon={<Lock size={28} color="var(--plum-700)" strokeWidth={1.75} />}
            number="2"
            title="Personal details are hidden"
            body="If you choose to search online, we scan your message for personal details — names, account numbers, phone numbers, OTP codes, BVN/NIN — and replace them with labels like [NAME_1] and [ACCOUNT_1]. The original values never leave your phone."
          />
          <div style={S.connector} aria-hidden="true" />
          <Step
            icon={<Search size={28} color="var(--plum-700)" strokeWidth={1.75} />}
            number="3"
            title="Only searched online if you ask"
            body="After you review the hidden version and tap 'Search online', only that masked text is sent — never the original message. You can also cancel at any point."
          />
        </div>

        <div style={S.note}>
          <strong>No account needed.</strong> ScamShield does not store your messages,
          create a profile, or share anything with third parties.
          The optional ScamShield Agent searches the web on your behalf using the masked text only.
        </div>
      </div>
    </div>
  );
}

function Step({ icon, number, title, body }) {
  return (
    <div style={S.step}>
      <div style={S.stepIcon}>
        {icon}
        <span style={S.stepNum}>{number}</span>
      </div>
      <div>
        <h2 style={S.stepTitle}>{title}</h2>
        <p style={S.stepBody}>{body}</p>
      </div>
    </div>
  );
}

const S = {
  h1: {
    fontSize: '1.75rem',
    marginBottom: 10,
  },
  lead: {
    fontSize: '1.0625rem',
    color: '#555',
    lineHeight: 1.6,
    marginBottom: 36,
  },
  steps: {
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    marginBottom: 36,
  },
  step: {
    display: 'flex',
    gap: 20,
    alignItems: 'flex-start',
    padding: '20px 0',
  },
  stepIcon: {
    position: 'relative',
    width: 52,
    height: 52,
    borderRadius: 14,
    background: 'var(--plum-100)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepNum: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: '50%',
    background: 'var(--plum-700)',
    color: 'white',
    fontSize: '0.75rem',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
  },
  stepTitle: {
    fontSize: '1.0625rem',
    marginBottom: 6,
  },
  stepBody: {
    fontSize: '0.9375rem',
    lineHeight: 1.6,
    color: '#444',
  },
  connector: {
    marginLeft: 26,
    width: 2,
    height: 20,
    background: 'var(--line)',
    borderRadius: 2,
    flexShrink: 0,
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
