import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service";

/** Reads one switch or number from hub_settings (the Creator can change them without a deploy). */
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const { data } = await createServiceRoleClient().from("hub_settings").select("value").eq("key", key).maybeSingle();
  return data?.value === undefined || data?.value === null ? fallback : (data.value as T);
}
