"use client";

import { useAuth } from "@/contexts/AuthContext";
import { contactSentence } from "@/lib/site";

// Tells a signed-in person plainly when their account is restricted or
// suspended, with the end date for a restriction. Nothing is shown to anyone
// else, and nothing about who acted.
export function StandingBanner() {
  const { user } = useAuth();
  if (!user) return null;

  let text: string | null = null;
  if (user.accountStatus === "suspended") {
    text = `Your account is suspended while the hub's Creator reviews it. You can't post, upload or comment. ${contactSentence()}`;
  } else if (user.restrictedUntil) {
    const until = new Date(user.restrictedUntil).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    text = `Your account is restricted until ${until}. You can read and download, but you can't post, upload or comment.`;
  }
  if (!text) return null;

  return (
    <div className="banner-wrap">
      <div className="banner-box" role="status">
        <span>{text}</span>
      </div>
    </div>
  );
}
