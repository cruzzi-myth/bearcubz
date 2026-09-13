import { getOrCreateDeviceId } from './device';

export type VoteResult = {
  track_id: number;
  votes: number;
  percentage: number;
};

export type VoteResponse = {
  ok?: boolean;
  error?: string;
  votedToday?: boolean;
  trackId?: number;
  results?: VoteResult[];
  resetAt: string;
};

const functionUrl = import.meta.env.VITE_MOON_RACER_VOTE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function request(action: 'status' | 'vote', trackId?: number): Promise<VoteResponse> {
  if (!functionUrl || !anonKey) {
    throw new Error('VOTE_NOT_CONFIGURED');
  }

  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ action, trackId, deviceId: getOrCreateDeviceId() }),
  });

  const data = (await response.json()) as VoteResponse;
  // 409 (ALREADY_VOTED) is a normal, expected outcome carrying a full
  // payload (results + resetAt) — only other non-OK statuses are errors.
  if (!response.ok && response.status !== 409) {
    throw new Error(data.error ?? 'VOTE_REQUEST_FAILED');
  }
  return data;
}

export const getVoteStatus = () => request('status');
export const castVote = (trackId: number) => request('vote', trackId);
