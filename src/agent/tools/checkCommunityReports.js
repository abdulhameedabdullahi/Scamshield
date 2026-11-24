// check_community_reports tool — query anonymous community scam reports.
//
// Looks up a domain or phone number in the Firestore 'reports' collection
// (or returns deterministic mock data if USE_MOCK_REPORTS is true).
//
// Results labelled "demo data" in the UI when mock mode is active.

import { queryReports, normalizeIndicator } from '../../services/reports';

// ── Function declaration for Firebase AI ──────────────────────────────────

export const declaration = {
  name: 'check_community_reports',
  description:
    'Query the ScamShield community database to see how many users have reported a ' +
    'specific domain or phone number as part of a scam. Returns the count, last report ' +
    'date, and top scam categories.',
  parameters: {
    type: 'object',
    properties: {
      indicator: {
        type: 'string',
        description: 'The domain (e.g. "scam.example.tk") or phone number (e.g. "08012345678") to look up',
      },
      kind: {
        type: 'string',
        enum: ['domain', 'phone'],
        description: 'Whether indicator is a domain or phone number',
      },
    },
    required: ['indicator', 'kind'],
  },
};

// ── Execute ────────────────────────────────────────────────────────────────

export async function execute({ indicator, kind }) {
  const normalised = normalizeIndicator(indicator, kind);
  const result = await queryReports(indicator, kind);
  return { normalised, ...result };
}
