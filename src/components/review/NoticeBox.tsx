// A reviewer's notice shown above a post, file or comment. It names the tier
// ("a Watcher", "a Deacon", "the Creator"), never the person.
const TIER: Record<string, string> = { watcher: "a Watcher", deacon: "a Deacon", creator: "the Creator" };

export function NoticeBox({ notice }: { notice: { tier: string; body: string } | null | undefined }) {
  if (!notice) return null;
  return (
    <div className="banner-box" role="note" style={{ margin: "0 0 10px", display: "block" }}>
      <strong>Notice from {TIER[notice.tier] ?? "a reviewer"}:</strong> {notice.body}
    </div>
  );
}
