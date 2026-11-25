// Community reports service: query and save anonymous scam reports in Firestore.
//
// Privacy model:
//   - Raw phone numbers and URLs are NEVER stored in Firestore.
//   - Each indicator is normalised then SHA-256-hashed on-device before any network call.
//   - Saved documents contain only: indicatorHash, kind, category, uid, createdAt.
//   - Document IDs are deterministic: SHA-256(uid + ':' + indicatorHash), preventing duplicates.
//
// USE_MOCK_REPORTS (config.js): when true, returns deterministic demo data so
// the agent tool works before Firestore rules are deployed.

import {
  getFirestore, collection, query, where, orderBy, limit, getDocs,
  setDoc, doc, Timestamp,
} from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { app, auth } from '../firebase';
import { USE_MOCK_REPORTS } from '../config';
import { hashIndicator, reportDocId } from './hashIndicator';

let _db = null;
function db() {
  if (!_db) _db = getFirestore(app);
  return _db;
}

// ── Anonymous auth ─────────────────────────────────────────────────────────

async function ensureAuth() {
  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
}

// ── Normalisation ──────────────────────────────────────────────────────────

function normalizeIndicator(indicator, kind) {
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

// ── Mock data (deterministic from indicator string) ────────────────────────

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

function getMockReports(normalised) {
  const h = simpleHash(normalised);
  const isKnownScam =
    normalised.includes('verify') || normalised.includes('scam') ||
    normalised.includes('phish') || normalised.includes('reward') ||
    normalised.includes('prize');

  const count = isKnownScam ? 20 + (h % 80) : h % 8;
  if (count === 0) return { count: 0, lastReportedAt: null, topCategories: [], demo: true };

  const catIdx = h % MOCK_CATEGORIES.length;
  const topCategories = [MOCK_CATEGORIES[catIdx]];
  if (count > 10) topCategories.push(MOCK_CATEGORIES[(catIdx + 1) % MOCK_CATEGORIES.length]);

  const daysAgo = h % 30;
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const lastReportedAt = d.toISOString().slice(0, 10);

  return { count, lastReportedAt, topCategories, demo: true };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Query reports for a domain or phone indicator.
 * Hashes the indicator on-device before querying — the raw value never leaves the browser.
 * Returns { count, lastReportedAt, topCategories, demo? }
 */
export async function queryReports(indicator, kind) {
  const normalised = normalizeIndicator(indicator, kind);

  if (USE_MOCK_REPORTS) {
    return getMockReports(normalised);
  }

  try {
    await ensureAuth();
    const indHash = await hashIndicator(normalised);

    const q = query(
      collection(db(), 'reports'),
      where('indicatorHash', '==', indHash),
      where('kind', '==', kind),
      orderBy('createdAt', 'desc'),
      limit(100),
    );
    const snap = await getDocs(q);

    if (snap.empty) return { count: 0, lastReportedAt: null, topCategories: [] };

    const categories = {};
    let lastTs = null;
    snap.forEach((d) => {
      const data = d.data();
      if (data.category) categories[data.category] = (categories[data.category] ?? 0) + 1;
      const ts = data.createdAt?.toMillis?.() ?? 0;
      if (!lastTs || ts > lastTs) lastTs = ts;
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
 * Save an anonymous scam report.
 * Stores only { indicatorHash, kind, category, uid, createdAt } — no raw indicator, no message text.
 * Uses a deterministic doc ID to prevent duplicate reports from the same user for the same indicator.
 *
 * @param {{ verdict: string, category: string, indicator?: string, indicatorKind?: string }} report
 */
export async function saveReport(report) {
  if (USE_MOCK_REPORTS) return 'mock-report-id';
  if (!report.indicator || !report.indicatorKind) return null;

  await ensureAuth();
  const uid = auth.currentUser.uid;
  const normalised = normalizeIndicator(report.indicator, report.indicatorKind);
  const indHash = await hashIndicator(normalised);
  const docId = await reportDocId(uid, indHash);

  await setDoc(doc(db(), 'reports', docId), {
    indicatorHash: indHash,
    kind: report.indicatorKind,
    category: report.category ?? 'other',
    uid,
    createdAt: Timestamp.now(),
  });

  return docId;
}
