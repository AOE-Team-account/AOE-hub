// Points formula — exact values from project memory. Only File Board and
// Experience Board activity earns points; private Groups never do.

export const POINTS = {
  VIEW: 1, // rate-limited to once per person per day
  DOWNLOAD: 5,
  COMMENT_RECEIVED: 3, // per question/comment left on your post
  REMIX: 10, // per remix of your file
} as const;

/**
 * A user's profile total is always a simple, honest sum of raw point events —
 * never compressed. Compression only applies to search ranking (see below).
 */
export function sumProfilePoints(events: { points: number }[]): number {
  return events.reduce((total, event) => total + event.points, 0);
}

/**
 * Search ranking uses a log-compressed version of raw engagement so one huge
 * hit doesn't permanently bury newer good content. Ranking is also scoped
 * within category by the caller — this function just compresses a raw count.
 */
export function compressedEngagementScore(rawPoints: number): number {
  return Math.log10(Math.max(0, rawPoints) + 1);
}
