import { DAILY_CLOUD_LIMIT } from '../config';

function todayKey() {
  return `scamshield_checks_${new Date().toISOString().slice(0, 10)}`;
}

export function getDailyCount() {
  try { return parseInt(localStorage.getItem(todayKey()) ?? '0', 10); } catch { return 0; }
}

export function incrementDailyCount() {
  try {
    const k = todayKey();
    const n = parseInt(localStorage.getItem(k) ?? '0', 10) + 1;
    localStorage.setItem(k, String(n));
    return n;
  } catch { return 0; }
}

export function isOverDailyLimit() {
  return getDailyCount() >= DAILY_CLOUD_LIMIT;
}
