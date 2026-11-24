// Dev tests for the agent tools.
// Run from the browser console: runAgentTests()
// Also exposes runAgentDemo() for the developer-tools "Run agent demo" button.

import { execute as analyzeLink } from '../agent/tools/analyzeLink';
import { runAgent } from '../agent/runAgent';
import { analyzeSignals } from '../ai/rules';
import { TEST_MESSAGES } from './testMessages';

// ── analyze_link unit tests ────────────────────────────────────────────────

const LINK_TESTS = [
  {
    id: 1,
    label: 'Lookalike domain (zenovabank.tk)',
    url: 'http://zenovabank.tk/login',
    expectRiskLevel: ['high', 'medium'],
    expectReasonContains: ['zenova', 'TLD', 'brand'],
  },
  {
    id: 2,
    label: 'IP-address host',
    url: 'http://192.168.1.100/verify',
    expectRiskLevel: ['high'],
    expectReasonContains: ['IP address'],
  },
  {
    id: 3,
    label: 'Punycode domain',
    url: 'http://xn--hldnbnk-9za.com/update',
    expectRiskLevel: ['high', 'medium'],
    expectReasonContains: ['Punycode', 'xn--'],
  },
  {
    id: 4,
    label: 'Known URL shortener',
    url: 'https://bit.ly/scam123',
    expectRiskLevel: ['high', 'medium'],
    expectReasonContains: ['shortener'],
  },
  {
    id: 5,
    label: 'Clean legitimate domain',
    url: 'https://google.com',
    expectRiskLevel: ['safe', 'low'],
    expectReasonContains: [],
  },
];

function runLinkTest(t) {
  const result = analyzeLink({ url: t.url });
  const levelOk = t.expectRiskLevel.includes(result.riskLevel);
  const reasonOk = t.expectReasonContains.length === 0
    || t.expectReasonContains.some((kw) =>
        result.reasons.some((r) => r.toLowerCase().includes(kw.toLowerCase()))
      );
  const ok = levelOk && reasonOk;
  const detail = `riskLevel=${result.riskLevel}, reasons=[${result.reasons.slice(0, 2).join('; ')}]`;
  return { ok, detail };
}

export function runAgentTests() {
  console.log('=== analyze_link unit tests ===');
  let passed = 0, failed = 0;

  for (const t of LINK_TESTS) {
    const { ok, detail } = runLinkTest(t);
    if (ok) passed++; else failed++;
    console.log(`${ok ? '✓' : '✗'} [${t.id}] ${t.label} — ${detail}`);
  }

  console.log(`\nLink tests: ${passed}/${passed + failed} passed`);
  return { passed, failed };
}

// ── Agent demo (run full agent on message #1) ──────────────────────────────

/**
 * Run the full agent on test message #1 and log every event to the console.
 * Called from the "Run agent demo" dev button.
 * @param {string} [maskedText] - Override the masked text (optional)
 */
export async function runAgentDemo(maskedText) {
  const msg = TEST_MESSAGES[0]; // Fake debit alert with login link
  const text = maskedText ?? msg.text;
  const signals = analyzeSignals(text);

  const mockVerdict = {
    verdict: 'scam',
    confidence: 'high',
    category: 'fake_bank_alert',
    explanation: 'Demo verdict — using test message without real AI check.',
    redFlags: [{ phrase: 'click here to reverse', reason: 'Urgency + link' }],
  };

  console.log('=== ScamShield Agent Demo ===');
  console.log('Message:', text.slice(0, 100) + (text.length > 100 ? '…' : ''));
  console.log('Signals:', signals.signals.map((s) => s.id).filter(Boolean).join(', ') || 'none');
  console.log('');

  const events = [];

  try {
    const { finalResult } = await runAgent(text, mockVerdict, signals, (event) => {
      events.push(event);
      if (event.type === 'thinking')     console.log(`💭 ${event.summary}`);
      if (event.type === 'tool_call')    console.log(`→  ${event.summary} ${JSON.stringify(event.args)}`);
      if (event.type === 'tool_result')  console.log(`←  ${event.summary} (${event.durationMs}ms)`);
      if (event.type === 'final')        console.log('\n📋 Final answer:', JSON.stringify(event.result, null, 2));
      if (event.type === 'error')        console.error('❌ Error:', event.summary);
    });

    console.log('\nEvent trace:', events.length, 'events');
    return { events, finalResult };
  } catch (err) {
    console.error('Agent demo failed:', err);
    throw err;
  }
}
