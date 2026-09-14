// Pure constants/helpers for the group-creation eligibility check. Kept in
// their own module (no Supabase import) so client components — like the
// create-group form, which shows these live against the user's own stats —
// can import them without pulling in the server-only Supabase client.
//
// Eligibility to create a group, per project memory: 500+ points, account
// older than 90 days, no unresolved reports. These mirror the hard gate
// enforced server-side by creator_must_be_eligible_for_group() in
// supabase/schema.sql — keep the two in sync if the numbers ever change.

export const GROUP_CREATE_MIN_POINTS = 500;
export const GROUP_CREATE_MIN_ACCOUNT_AGE_DAYS = 90;

export function daysSince(isoDate: string): number {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24));
}
