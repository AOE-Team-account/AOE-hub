import { NextResponse } from "next/server";
import { requireAdmin, requireCreator } from "@/lib/ai/server/admin-guard";
import {
  GEMINI_EMBEDDING_MODEL,
  cancelNextEmbeddingModel,
  cleanupEmbeddingModels,
  startNextEmbeddingModel,
  switchBackEmbeddingModel,
  switchToNextEmbeddingModel,
} from "@/lib/ai/server/embedding-models";
import { getProviderStatuses } from "@/lib/ai/server/hub-ai";
import { getIndexStatus } from "@/lib/ai/server/indexer";

export const runtime = "nodejs";

// The "AI data" card on the admin page: which embedding model searches use,
// how far the next one is, and the safe cut-over steps (start, switch, clean
// up). Reading is for admins; changing is for the unlocked Creator only.
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const [status, providers] = await Promise.all([getIndexStatus(), getProviderStatuses()]);
  return NextResponse.json({
    ...status,
    providers,
    googleConfigured: Boolean(process.env.GOOGLE_AI_API_KEY),
    groqConfigured: Boolean(process.env.GROQ_API_KEY),
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
        if (!process.env.GOOGLE_AI_API_KEY) return NextResponse.json({ error: "GOOGLE_AI_API_KEY is not set in .env.local yet." }, { status: 400 });
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
