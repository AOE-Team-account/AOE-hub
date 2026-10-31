import { redirect } from "next/navigation";
import { BackLink } from "@/components/ui/BackLink";
import { requireStaff } from "@/lib/auth/staff";
import { getServerT } from "@/lib/i18n/server";
import { LanguageSelect } from "@/components/ui/LanguageSelect";
import { loadReviewData, type ItemKind } from "@/lib/data/review";
import { ReviewPanel } from "@/components/review/ReviewPanel";
import { RulesButton } from "@/components/review/RulesModal";

// The Watcher / Deacon panel: a protected page, not a hidden div. Every
// request re-checks the role on the server; anyone else gets a plain 404.
// The panel contains no posting, uploading or selling of any kind.
export const dynamic = "force-dynamic";

export default async function ModPanelPage() {
  const { supabase, userId, roles } = await requireStaff(["watcher", "deacon"]);
  const { t } = await getServerT();
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
      <BackLink href="/profile" label={t("staff.backToProfile")} />
      <div className="row between wrap" style={{ gap: 8, margin: "0 0 2px" }}>
        <p role="heading" aria-level={2} className="title" style={{ margin: 0 }}>{isWatcher ? t("staff.watcherPanel") : t("staff.deaconPanel")}</p>
        <LanguageSelect style={{ width: "auto", padding: "6px 10px", fontSize: 13 }} />
      </div>
      <p className="tiny" style={{ marginBottom: 8 }}>
        {isWatcher ? t("staff.watcherIntro") : t("staff.deaconIntro")}
      </p>
      <p className="tiny" style={{ marginBottom: 8 }}>{t("staff.reviewOnly")}</p>
      <div style={{ marginBottom: 12 }}><RulesButton /></div>
      <ReviewPanel data={data} isCreator={false} canSuspend={isWatcher} />
    </>
  );
}
