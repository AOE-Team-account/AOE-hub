import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { sendAlertEmail } from "@/lib/email/alert";
import { measureMainBucket } from "./usage";

// Watches how full the main R2 bucket is. Cloudflare gives 10 GB free and then
// simply starts charging, so the Creator is told at 8, 9 and 10 GB: by a
// notification in the hub and by email. Each level is announced once as the
// storage grows (and again if it later falls and grows back).

export const STORAGE_LEVELS_BYTES = [8e9, 9e9, 10e9];
export const FREE_ALLOWANCE_BYTES = 10e9;
const KEY = "storage_usage";

export interface StorageState {
  bytes: number;
  objects: number;
  checked_at: string;
  level: number; // how many of the levels are passed (0..3)
}

export async function readStorageState(): Promise<StorageState | null> {
  const { data } = await createServiceRoleClient().from("hub_settings").select("value").eq("key", KEY).maybeSingle();
  return (data?.value as StorageState | undefined) ?? null;
}

const gb = (n: number) => (n / 1e9).toFixed(2);

export async function checkStorage(): Promise<StorageState & { alerted: boolean }> {
  const db = createServiceRoleClient();
  const previous = await readStorageState();
  const { bytes, objects } = await measureMainBucket();
  const level = STORAGE_LEVELS_BYTES.filter((l) => bytes >= l).length;
  const state: StorageState = { bytes, objects, checked_at: new Date().toISOString(), level };
  await db.from("hub_settings").upsert({ key: KEY, value: state }, { onConflict: "key" });

  let alerted = false;
  if (level > (previous?.level ?? 0)) {
    const message =
      level >= 3
        ? `The hub's main storage (Cloudflare R2) now holds ${gb(bytes)} GB. Cloudflare's free 10 GB is used up, so extra storage is now being charged (about $0.015 per GB per month). Nothing stops working.`
        : `The hub's main storage (Cloudflare R2) now holds ${gb(bytes)} GB. Cloudflare's free allowance is 10 GB; beyond that extra storage is charged (about $0.015 per GB per month).`;
    const { data: creators } = await db.from("user_roles").select("user_id").eq("role", "creator");
    for (const c of (creators ?? []) as { user_id: string }[]) {
      await db.from("notifications").insert({ user_id: c.user_id, body: `Storage warning: ${message}`, kind: "storage-warning", data: { bytes, level } });
    }
    await sendAlertEmail(`AOEhub storage warning: ${gb(bytes)} GB used`, `${message}\n\nYou can see it any time in the Creator panel, Hub tab, "Storage".\n`);
    alerted = true;
  }
  return { ...state, alerted };
}
