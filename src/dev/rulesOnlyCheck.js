// Rules-only check for the test suite — Stage A of the full pipeline in isolation.
// Pure synchronous JS, no AI, no network. Represents what any phone gets instantly.
//
// Returns `verdict` for scoring ('safe' | 'scam' | 'suspicious') and `rawVerdict`
// for display — adds 'unclear' when rule signal is insufficient. The TestRunner
// scores 'unclear' as 'suspicious' (conservative: never misses scams, but can't
// confirm safety without AI).

import { analyzeSignals } from '../ai/rules';

export function rulesOnlyCheck(text) {
  const start = Date.now();
  const { signals, ruleScore } = analyzeSignals(text);

  const hasStrongSafe = signals.some((s) => s.id === 'do_not_share' || s.id === 'standard_alert');
  const positiveSignals = signals.filter((s) => s.weight > 0);
  const ruleFlags = positiveSignals
    .filter((s) => s.start >= 0 && s.phrase)
    .slice(0, 3)
    .map((s) => ({ phrase: s.phrase, reason: s.label, source: 'rule', start: s.start, end: s.end }));

  let verdict, rawVerdict, confidence, category, redFlags, needsAiReview;

  if (hasStrongSafe && positiveSignals.length === 0) {
    verdict = 'safe'; rawVerdict = 'safe';
    confidence = 'low'; category = 'none'; redFlags = []; needsAiReview = false;
  } else if (ruleScore >= 10) {
    verdict = 'scam'; rawVerdict = 'scam';
    confidence = 'low'; category = 'other'; redFlags = ruleFlags; needsAiReview = false;
  } else if (ruleScore >= 6) {
    verdict = 'suspicious'; rawVerdict = 'suspicious';
    confidence = 'low'; category = 'other'; redFlags = ruleFlags; needsAiReview = false;
  } else {
    // Insufficient rule signal — scored conservatively as 'suspicious', displayed as 'unclear'
    verdict = 'suspicious'; rawVerdict = 'unclear';
    confidence = 'low'; category = 'other'; redFlags = ruleFlags; needsAiReview = true;
  }

  return {
    verdict,
    rawVerdict,
    confidence,
    category,
    redFlags,
    explanation: rawVerdict === 'unclear'
      ? 'Not enough rule signal — AI review recommended.'
      : 'Rule engine verdict only. No AI was used.',
    source: 'rules-only',
    signals,
    durationMs: Date.now() - start,
    needsAiReview,
  };
}
