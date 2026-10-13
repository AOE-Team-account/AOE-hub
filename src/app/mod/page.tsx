import { redirect } from "next/navigation";
import { BackLink } from "@/components/ui/BackLink";
import { requireStaff } from "@/lib/auth/staff";
import { loadReviewData, type ItemKind } from "@/lib/data/review";
import { ReviewPanel } from "@/components/review/ReviewPanel";
import { RulesButton } from "@/components/review/RulesModal";

// The Watcher / Deacon panel: a protected page, not a hidden div. Every
// request re-checks the role on the server; anyone else gets a plain 404.
// The panel contains no posting, uploading or selling of any kind.
export const dynamic = "force-dynamic";

export default async function ModPanelPage() {
  const { supabase, userId, roles } = await requireStaff(["watcher", "deacon"]);
  // Watchers and Deacons must have passed two-step sign-in (a hub setting the
  // Creator can switch off). The database enforces the same rule per action.
  const { data: twoStep } = await supabase.rpc("my_two_step_status");
  if (twoStep?.required_for_staff && !twoStep?.aal2) redirect("/security?next=/mod");

  const isWatcher = roles.includes("watcher");
  // A Watcher sees posts, comments and files; a Deacon posts and comments only.
  const kinds: ItemKind[] = isWatcher ? ["file", "post", "comment"] : ["post", "comment"];
  const data = await loadReviewData(supabase, userId, kinds);

  return (
    <>
      <BackLink href="/profile" label="Back to my profile" />
      <p className="title" style={{ margin: "0 0 2px" }}>{isWatcher ? "Watcher panel" : "Deacon panel"}</p>
      <p className="tiny" style={{ marginBottom: 8 }}>
        {isWatcher
          ? "You can see every post, comment and file, and every report. Add a notice, warn, delete, or dismiss."
          : "You can see every post and comment, and the reports on them (never files). Add a notice, warn, delete, or dismiss."}
      </p>
      <p className="tiny" style={{ marginBottom: 8 }}>
        This panel is for reviewing only. You can&apos;t post, upload files, or list items for sale from here. To do those,
        leave the panel and use the hub as yourself, like any other member.
      </p>
      <div style={{ marginBottom: 12 }}><RulesButton /></div>
      <ReviewPanel data={data} isCreator={false} canSuspend={isWatcher} />
    </>
  );
}
