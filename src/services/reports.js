// Community reports: saves and reads anonymous masked scam reports to Firestore.
//
// Reports never contain raw PII — only masked text and the AI verdict.
// Anonymous Auth is used so users can contribute without signing in.
//
// TODO: implement these functions
//   1. Import getFirestore, collection, addDoc, getDocs, query, orderBy, limit
//      from 'firebase/firestore'
//   2. Import app from '../firebase'
//   3. Create db = getFirestore(app)
//   4. saveReport: addDoc to 'reports' collection
//   5. getRecentReports: getDocs with orderBy('createdAt', 'desc'), limit(50)

/**
 * Save an anonymous masked scam report to Firestore.
 * @param {{ maskedText: string, verdict: string, confidence: number, redFlags: string[] }} report
 * @returns {Promise<string>} The new document ID
 */
export async function saveReport(report) {
  void report;
  throw new Error('saveReport is not yet implemented');
}

/**
 * Fetch the 50 most recent community reports from Firestore.
 * @returns {Promise<Array>}
 */
export async function getRecentReports() {
  throw new Error('getRecentReports is not yet implemented');
}
