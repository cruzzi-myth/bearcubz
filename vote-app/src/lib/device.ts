// Lightweight, no-account device identity for the daily vote. This is
// a UX convenience only — clearing storage or private browsing can
// mint a new device id, and that's an accepted tradeoff for a fan
// voting experience. The database (unique device_hash + vote_day) is
// the real enforcement; see supabase/functions/moon-racer-vote.

const DEVICE_KEY = 'moon_racer_vote_device_v1';
const RECEIPT_KEY = 'moon_racer_vote_receipt_v1';

export function getOrCreateDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_KEY);
  if (existing) return existing;

  const id = crypto.randomUUID();
  localStorage.setItem(DEVICE_KEY, id);
  return id;
}

export function pacificDayKey(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function saveTodaysVote(trackId: number): void {
  localStorage.setItem(
    RECEIPT_KEY,
    JSON.stringify({ day: pacificDayKey(), trackId }),
  );
}

export function getTodaysVote(): number | null {
  try {
    const value = JSON.parse(
      localStorage.getItem(RECEIPT_KEY) ?? 'null',
    ) as { day?: string; trackId?: number } | null;

    return value?.day === pacificDayKey() && Number.isInteger(value.trackId)
      ? value.trackId!
      : null;
  } catch {
    return null;
  }
}
