import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/staff";
import { loadReviewData } from "@/lib/data/review";
import { CreatorClient, type CreatorData } from "./CreatorClient";

// The Creator panel: a protected page re-checked on the server for every
// request. (The sign-in access code and two-factor step arrive with the
// Creator-access work; until then the live login plus this role check guard it.)
export const dynamic = "force-dynamic";

export default async function CreatorPage() {
  const { supabase, userId } = await requireStaff(["creator"]);

  // The second and third steps: two-step sign-in and the access code. The
  // database applies the same check to every Creator action; this only sends
  // a locked session to the unlock screen instead of showing errors.
  const { data: status } = await supabase.rpc("creator_status");
  if (!status?.unlocked) redirect("/creator/unlock");

  const review = await loadReviewData(supabase, userId, ["file", "post", "comment"]);

  const [settingsRes, eventsRes, holdersRes, queueRes, trashRes, logRes] = await Promise.all([
    supabase.rpc("get_hub_settings"),
    supabase.rpc("creator_security_events_list"),
    supabase.from("user_roles").select("user_id, role, granted_at").in("role", ["watcher", "deacon", "answerer", "verified"]),
    supabase.rpc("creator_account_queue"),
    supabase.rpc("list_trash"),
    supabase.from("activity_log").select("id, created_at, actor_id, actor_role, action, target_kind, target_id, subject_user_id, reason_code, details, undoes").order("id", { ascending: false }).limit(200),
  ]);

  const holders = (holdersRes.data ?? []) as { user_id: string; role: string }[];
  const trash = (trashRes.data ?? []) as CreatorData["trash"];
  const log = (logRes.data ?? []) as CreatorData["log"];

  const nameIds = new Set<string>();
  holders.forEach((h) => nameIds.add(h.user_id));
  trash.forEach((t) => nameIds.add(t.author_id));
  log.forEach((l) => {
    if (l.actor_id) nameIds.add(l.actor_id);
    if (l.subject_user_id) nameIds.add(l.subject_user_id);
  });
  const { data: people } = nameIds.size
    ? await supabase.from("profiles").select("id, name, display_name").in("id", [...nameIds])
    : { data: [] as { id: string; name: string; display_name: string | null }[] };
  const names: Record<string, string> = Object.fromEntries(
    (people ?? []).map((p) => [p.id, p.display_name || p.name])
  );

  const data: CreatorData = {
    review,
    holders,
    accounts: (queueRes.data ?? []) as CreatorData["accounts"],
    trash,
    log,
    names,
    security: {
      requireTwoStepForStaff: (settingsRes.data as Record<string, unknown> | null)?.require_2fa_staff !== false,
      events: (eventsRes.data ?? []) as { at: string; kind: string }[],
      keysLeft: (status?.keys_left as number) ?? 0,
    },
  };

  return <CreatorClient data={data} />;
}
