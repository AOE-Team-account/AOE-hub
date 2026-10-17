import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service";

// Daily caps live in hub_settings so they can be changed without a deploy.
async function setting(key: string, fallback: number): Promise<number> {
  const { data } = await createServiceRoleClient().from("hub_settings").select("value").eq("key", key).maybeSingle();
  const n = Number(data?.value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export const contentCap = () => setting("translation_daily_cap", 2000);
export const newLanguageCap = () => setting("new_language_daily_cap", 3);
export const maxAiLanguages = () => setting("max_ai_languages", 30);

/** Takes n units from today's allowance; false when that would go over the cap. */
export async function takeBudget(kind: string, n: number, cap: number): Promise<boolean> {
  if (n <= 0) return true;
  const { data, error } = await createServiceRoleClient().rpc("take_translation_budget", { p_kind: kind, p_n: n, p_cap: cap });
  if (error) throw new Error("Could not check the translation allowance.");
  return data === true;
}

export async function refundBudget(kind: string, n: number): Promise<void> {
  if (n <= 0) return;
  await createServiceRoleClient().rpc("refund_translation_budget", { p_kind: kind, p_n: n });
}
