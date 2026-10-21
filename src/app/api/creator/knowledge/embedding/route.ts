import { NextResponse } from "next/server";
import { requireCreator } from "@/lib/ai/server/creator-guard";
import {
  GEMINI_EMBEDDING_MODEL,
  cancelNextEmbeddingModel,
  cleanupEmbeddingModels,
  startNextEmbeddingModel,
  switchBackEmbeddingModel,
  switchToNextEmbeddingModel,
} from "@/lib/ai/server/embedding-models";
import { googleKeys } from "@/lib/ai/server/google-keys";
import { getProviderStatuses } from "@/lib/ai/server/hub-ai";
import { getIndexStatus } from "@/lib/ai/server/indexer";

export const runtime = "nodejs";

// The "AI data" card in the Creator panel: which embedding model searches use,
// how far the next one is, and the safe cut-over steps (start, switch, clean
// up). Creator only, like everything in this folder.
export async function GET() {
  const guard = await requireCreator();
  if (!guard.ok) return guard.response;
  const [status, providers] = await Promise.all([getIndexStatus(), getProviderStatuses()]);
  const google = await googleKeys();
  return NextResponse.json({
    ...status,
    providers,
    googleConfigured: google.length > 0,
    googleKeyCount: google.length,
    groqConfigured: providers.some((p) => p.id.startsWith("groq")),
    suggestedModel: GEMINI_EMBEDDING_MODEL,
  });
}

export async function POST(request: Request) {
  const guard = await requireCreator();
  if (!guard.ok) return guard.response;
  const body = (await request.json().catch(() => ({}))) as { action?: string; model?: string };
  try {
    switch (body.action) {
      case "start-next":
        if ((await googleKeys()).length === 0) return NextResponse.json({ error: "No Google key has been added yet. Add one in the AI key pool." }, { status: 400 });
        await startNextEmbeddingModel(GEMINI_EMBEDDING_MODEL);
        return NextResponse.json({ ok: true });
      case "cancel-next":
        await cancelNextEmbeddingModel();
        return NextResponse.json({ ok: true });
      case "switch":
        return NextResponse.json({ ok: true, ...(await switchToNextEmbeddingModel()) });
      case "switch-back":
        if (!body.model) return NextResponse.json({ error: "Missing model." }, { status: 400 });
        await switchBackEmbeddingModel(body.model);
        return NextResponse.json({ ok: true });
      case "cleanup":
        return NextResponse.json({ ok: true, removedChunks: await cleanupEmbeddingModels() });
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed." }, { status: 400 });
  }
}
