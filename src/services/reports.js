// Community reports service: query anonymous masked scam reports from Firestore.
//
// Security: reports collection stores only masked text + verdict + indicator.
// No PII is ever written here. The placeholderMap stays on-device.
//
// USE_MOCK_REPORTS (config.js): when true, returns deterministic demo data so
// the agent tool works before Firestore rules are deployed. The UI always
// labels mock results as "demo data".

import { getFirestore, collection, query, where, orderBy, limit, getDocs, addDoc, Timestamp } from 'firebase/firestore';
import { app } from '../firebase';
import { USE_MOCK_REPORTS } from '../config';

let _db = null;
function db() {
  if (!_db) _db = getFirestore(app);
  return _db;
}

// ── Normalisation ──────────────────────────────────────────────────────────

export function normalizeIndicator(indicator, kind) {
  if (kind === 'domain') {
    return indicator.toLowerCase().replace(/^www\./, '').split('/')[0];
  }
  if (kind === 'phone') {
    const digits = indicator.replace(/\D/g, '');
    if (digits.startsWith('0') && digits.length === 11) return '+234' + digits.slice(1);
    if (digits.startsWith('234') && digits.length === 13) return '+' + digits;
    return indicator;
  }
  return indicator.toLowerCase();
}

// ── Mock data (deterministic from indicator hash) ──────────────────────────

function simpleHash(s) {
  let h = 2166136261; // FNV-1a offset
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

const MOCK_CATEGORIES = [
  'fake_bank_alert', 'phishing_link', 'account_block_or_bvn_nin',
  'otp_pin_request', 'investment_scheme', 'impersonation',
];

function getMockReports(indicator) {
  const h = simpleHash(indicator);
  // Known-scam indicators always return high counts.
  const isKnownScam =
    indicator.includes('verify') ||
    indicator.includes('scam') ||
    indicator.includes('phish') ||
    indicator.includes('reward') ||
    indicator.includes('prize');

  const count = isKnownScam ? 20 + (h % 80) : h % 8;
  if (count === 0) return { count: 0, lastReportedAt: null, topCategories: [], demo: true };

  const catIdx = h % MOCK_CATEGORIES.length;
  const topCategories = [MOCK_CATEGORIES[catIdx]];
  if (count > 10) topCategories.push(MOCK_CATEGORIES[(catIdx + 1) % MOCK_CATEGORIES.length]);

  // Deterministic date in the last 30 days
  const daysAgo = h % 30;
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const lastReportedAt = d.toISOString().slice(0, 10);

  return { count, lastReportedAt, topCategories, demo: true };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Query reports for a domain or phone indicator.
 * Returns { count, lastReportedAt, topCategories, demo? }
 */
export async function queryReports(indicator, kind) {
  const normalised = normalizeIndicator(indicator, kind);

  if (USE_MOCK_REPORTS) {
    return getMockReports(normalised);
  }

  try {
    const q = query(
      collection(db(), 'reports'),
      where('indicator', '==', normalised),
      orderBy('createdAt', 'desc'),
      limit(100),
    );
    const snap = await getDocs(q);

    if (snap.empty) return { count: 0, lastReportedAt: null, topCategories: [] };

    const categories = {};
    let lastTs = null;
    snap.forEach((doc) => {
      const d = doc.data();
      if (d.category) categories[d.category] = (categories[d.category] ?? 0) + 1;
      if (!lastTs || (d.createdAt?.toMillis?.() ?? 0) > lastTs) {
        lastTs = d.createdAt?.toMillis?.() ?? 0;
      }
    });

    const topCategories = Object.entries(categories)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat]) => cat);

    return {
      count: snap.size,
      lastReportedAt: lastTs ? new Date(lastTs).toISOString().slice(0, 10) : null,
      topCategories,
    };
  } catch (err) {
    console.warn('[ScamShield] Firestore query failed, using mock:', err?.message);
    return getMockReports(normalised);
  }
}

/**
 * Save an anonymous masked scam report.
 * @param {{ maskedText, verdict, category, redFlags, indicator?, indicatorKind? }} report
 */
export async function saveReport(report) {
  if (USE_MOCK_REPORTS) return 'mock-report-id';
  const ref = await addDoc(collection(db(), 'reports'), {
    maskedText: report.maskedText,
    verdict: report.verdict,
    category: report.category ?? 'other',
    redFlags: (report.redFlags ?? []).map((f) => f.phrase ?? f).slice(0, 5),
    indicator: report.indicator ?? null,
    indicatorKind: report.indicatorKind ?? null,
    createdAt: Timestamp.now(),
  });
  return ref.id;
}
