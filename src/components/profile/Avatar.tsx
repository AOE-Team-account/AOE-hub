import { FRAME_SHADOW } from "@/lib/profile-look";

// A member's picture, or their initials when they have none, inside their chosen frame.
export function Avatar({
  userId, initials, avatarV, frame = "none", size = 52,
}: {
  userId: string;
  initials: string;
  avatarV?: string;
  frame?: string;
  size?: number;
}) {
  const common = { width: size, height: size, borderRadius: "50%", flexShrink: 0, boxShadow: FRAME_SHADOW[frame] ?? "none" } as const;
  if (avatarV) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/api/avatar/${userId}?v=${avatarV}`} alt="" width={size} height={size} style={{ ...common, objectFit: "cover", display: "block" }} />;
  }
  return (
    <div
      style={{
        ...common,
        background: "var(--accent)",
        color: "var(--accent-text)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 600,
        fontFamily: "var(--font-heading)",
        fontSize: Math.round(size * 0.34),
      }}
    >
      {initials}
    </div>
  );
}
