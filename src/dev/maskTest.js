// Dev tests for regexDetect and buildMaskedText.
// Run from browser console or the developer tools panel via runMaskTests().
//
// Tests regexDetect entity detection and buildMaskedText placeholder generation.
// No async needed — these are pure/sync functions.

import { regexDetect } from '../ai/regexMask';
import { buildMaskedText } from '../ai/maskMessage';

const TESTS = [
  {
    id: 1,
    label: 'Nigerian phone number',
    text: 'Call me on 08012345678 for more info.',
    expect: { type: 'phone_number', text: '08012345678' },
  },
  {
    id: 2,
    label: 'Email address',
    text: 'Send your CV to jobs@example.com today.',
    expect: { type: 'email', text: 'jobs@example.com' },
  },
  {
    id: 3,
    label: '10-digit account number',
    text: 'Transfer to account 1234567890 urgently.',
    expect: { type: 'account_number', text: '1234567890' },
  },
  {
    id: 4,
    label: '11-digit BVN/NIN',
    text: 'Verify your BVN 12345678901 now.',
    expect: { type: 'bvn_nin', text: '12345678901' },
  },
  {
    id: 5,
    label: 'Labelled BVN',
    text: 'Your BVN: 12345678901 must be updated.',
    expect: { type: 'bvn_nin', text: '12345678901' },
  },
  {
    id: 6,
    label: 'OTP code',
    text: 'Your OTP is 492817. Do not share.',
    expect: { type: 'otp_code', text: '492817' },
  },
  {
    id: 7,
    label: 'URL with http',
    text: 'Click http://ng-scam.com/login to verify.',
    expect: { type: 'url', text: 'http://ng-scam.com/login' },
  },
  {
    id: 8,
    label: 'Bare domain',
    text: 'Visit scamsite.ng to claim your prize.',
    expect: { type: 'url', text: 'scamsite.ng' },
  },
  {
    id: 9,
    label: 'Card number grouped',
    text: 'Card: 4111 1111 1111 1111 expired.',
    expect: { type: 'card_number', text: '4111 1111 1111 1111' },
  },
  {
    id: 10,
    label: 'No PII — legitimate bank alert',
    text: 'Halden Bank: Debit NGN 2,500 Acct ****1234. Not you? Call 0700-HALDENBANK.',
    expectNone: true,
  },
  {
    id: 11,
    label: 'Multiple entities — masking produces numbered placeholders',
    text: 'Send your phone 08099887766 and email test@test.com to us.',
    expectMultiple: true,
    expectTypes: ['phone_number', 'email'],
  },
  {
    id: 12,
    label: 'buildMaskedText — phone kept, account masked',
    text: 'Transfer 50000 to account 1234567890. Confirm on 08012345678.',
    testMasked: true,
    // phone_number defaultAction=keep, account_number defaultAction=mask
    expectMaskedContains: '[ACCOUNT_1]',
    expectMaskedNotContains: '[PHONE_1]',
    expectMaskedContainsOriginal: '08012345678',
  },
];

function runSingleTest(t) {
  if (t.expectNone) {
    const entities = regexDetect(t.text);
    const sensitive = entities.filter((e) => !['phone_number', 'url'].includes(e.type));
    const ok = sensitive.length === 0;
    const detail = ok ? '—' : `Got: ${sensitive.map((e) => e.type + ':' + e.text).join(', ')}`;
    return { ok, detail };
  }
  if (t.expectMultiple) {
    const entities = regexDetect(t.text);
    const types = entities.map((e) => e.type);
    const ok = t.expectTypes.every((et) => types.includes(et));
    return { ok, detail: `Detected: ${types.join(', ')}` };
  }
  if (t.testMasked) {
    const entities = regexDetect(t.text).map((e) => ({ ...e, defaultAction: e.type === 'phone_number' ? 'keep' : 'mask' }));
    const { maskedText } = buildMaskedText(t.text, entities);
    const a = maskedText.includes(t.expectMaskedContains);
    const b = !maskedText.includes(t.expectMaskedNotContains);
    const c = maskedText.includes(t.expectMaskedContainsOriginal);
    return { ok: a && b && c, detail: `masked: "${maskedText}"` };
  }
  const entities = regexDetect(t.text);
  const match = entities.find((e) => e.type === t.expect.type && e.text === t.expect.text);
  const ok = !!match;
  const detail = ok
    ? `start=${match.start} end=${match.end}`
    : `Got: ${entities.map((e) => e.type + ':' + e.text).join(', ')} (expected ${t.expect.type}:${t.expect.text})`;
  return { ok, detail };
}

export function runMaskTests() {
  let passed = 0;
  let failed = 0;
  const results = [];

  for (const t of TESTS) {
    let ok = false;
    let detail;

    try {
      const r = runSingleTest(t);
      ok = r.ok;
      detail = r.detail;
    } catch (err) {
      detail = `Error: ${err.message}`;
    }

    if (ok) passed++; else failed++;
    results.push({ id: t.id, label: t.label, ok, detail });
    console.log(`${ok ? '✓' : '✗'} [${t.id}] ${t.label} — ${detail}`);
  }

  console.log(`\nMask tests: ${passed}/${passed + failed} passed`);
  return results;
}
