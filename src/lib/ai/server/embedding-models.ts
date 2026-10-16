import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service";

// Which embedding model searches use ("live") and which one is being built
// alongside it ("next"). Kept in hub_settings so a cut-over is one small,
// reversible database change, never an instant swap of the library.
// Until a live model has been chosen, the model named in EMBEDDING_MODEL
// (the local development model) stays live.

export const GEMINI_EMBEDDING_MODEL = "gemini-embedding-001";

async function readSetting(key: string): Promise<string | null> {
  const { data } = await createServiceRoleClient().from("hub_settings").select("value").eq("key", key).maybeSingle();
  const v = data?.value;
  return typeof v === "string" && v ? v : null;
}

async function writeSetting(key: string, value: string | null): Promise<void> {
  const db = createServiceRoleClient();
  if (value === null) {
    await db.from("hub_settings").delete().eq("key", key);
    return;
  }
  const { error } = await db.from("hub_settings").upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

export async function getLiveEmbeddingModel(): Promise<string> {
  const live = await readSetting("embedding_model_live");
  if (live) return live;
  const fromEnv = process.env.EMBEDDING_MODEL;
  if (!fromEnv) throw new Error("No embedding model is configured (EMBEDDING_MODEL).");
  return fromEnv;
}

export async function getNextEmbeddingModel(): Promise<string | null> {
  return readSetting("embedding_model_next");
}

export async function startNextEmbeddingModel(model: string): Promise<void> {
  const live = await getLiveEmbeddingModel();
  if (model === live) throw new Error("That model is already the live one.");
  await writeSetting("embedding_model_next", model);
}

export async function cancelNextEmbeddingModel(): Promise<void> {
  await writeSetting("embedding_model_next", null);
}

// Switches searches to the new model. Refuses unless EVERY document is
// finished for it. The old model's data stays until the clean-up step, so a
// switch can be undone by switching back.
export async function switchToNextEmbeddingModel(): Promise<{ from: string; to: string }> {
  const next = await getNextEmbeddingModel();
  if (!next) throw new Error("No new model is being built.");
  const db = createServiceRoleClient();
  const { data: pending, error } = await db.rpc("kb_pending_count", { p_model: next });
  if (error) throw new Error(error.message);
  if ((pending as number) > 0) throw new Error(`${pending} documents are not finished for the new model yet.`);
  const from = await getLiveEmbeddingModel();
  await writeSetting("embedding_model_live", next);
  await writeSetting("embedding_model_next", null);
  return { from, to: next };
}

export async function switchBackEmbeddingModel(model: string): Promise<void> {
  const db = createServiceRoleClient();
  const { data: pending } = await db.rpc("kb_pending_count", { p_model: model });
  if ((pending as number) > 0) throw new Error("The old model's data is incomplete (it was cleaned up or is missing documents).");
  await writeSetting("embedding_model_live", model);
}

export async function cleanupEmbeddingModels(): Promise<number> {
  const keep = [await getLiveEmbeddingModel()];
  const next = await getNextEmbeddingModel();
  if (next) keep.push(next);
  const { data, error } = await createServiceRoleClient().rpc("kb_cleanup_models", { p_keep: keep });
  if (error) throw new Error(error.message);
  return data as number;
}
