import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getBadgeMap } from "@/lib/data/badges";
import { RoleBadges } from "@/components/ui/RoleBadges";

const CAP = 3;

// "From verified voices": self-pinned by Verified members (one post and one
// file each). Not algorithmic and never part of search. Hidden entirely when
// nobody qualifies. Items that are deleted, hidden or carry a notice drop out
// because the pin is cleared (or the row is no longer visible).
export async function VerifiedVoices({ board }: { board: "file" | "post" }) {
  const supabase = await createClient();
  const { data: pins } = await supabase
    .from("verified_pins")
    .select("user_id, item_id, pinned_at")
    .eq("board", board)
    .order("pinned_at", { ascending: false })
    .limit(CAP * 3);
  if (!pins || pins.length === 0) return null;

  const ids = pins.map((p) => p.item_id as string);
  const table = board === "file" ? "file_posts" : "experience_posts";
  const cols = board === "file" ? "id, title, description, author_id" : "id, title, body, author_id";
  const { data: items } = await supabase.from(table).select(cols).in("id", ids);
  const byId = new Map<string, Record<string, string | null>>(
    ((items ?? []) as unknown as Record<string, string | null>[]).map((i) => [i.id as string, i])
  );

  const authorIds = [...new Set((items ?? []).map((i) => (i as unknown as { author_id: string }).author_id))];
  const [{ data: people }, badges] = await Promise.all([
    authorIds.length ? supabase.from("profiles").select("id, name, display_name").in("id", authorIds) : { data: [] },
    getBadgeMap(supabase, authorIds),
  ]);
  const names = new Map((people ?? []).map((p) => [p.id as string, (p.display_name as string) || (p.name as string)]));

  const shown = pins
    .map((p) => byId.get(p.item_id as string))
    .filter((i): i is Record<string, string | null> => Boolean(i))
    .slice(0, CAP);
  if (shown.length === 0) return null;

  return (
    <div className="card" style={{ background: "var(--pin-bg)", borderColor: "var(--pin-border)" }}>
      <p className="label" style={{ fontWeight: 500, margin: "0 0 8px" }}>From verified voices</p>
      {shown.map((i) => {
        const href = board === "file" ? `/files/${i.id}` : `/experience/${i.id}`;
        const text = board === "file" ? (i.title as string) : ((i.title as string) || (i.body as string) || "").slice(0, 90);
        const authorId = i.author_id as string;
        return (
          <div key={i.id as string} className="row wrap" style={{ gap: 8, padding: "4px 0" }}>
            <Link href={href} style={{ fontWeight: 500, fontSize: 14 }}>{text}</Link>
            <span className="tiny">by {names.get(authorId) ?? "a member"}</span>
            <RoleBadges roles={badges[authorId]} />
          </div>
        );
      })}
    </div>
  );
}
