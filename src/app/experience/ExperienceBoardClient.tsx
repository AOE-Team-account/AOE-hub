"use client";

import { useEffect, useState } from "react";
import { ChipRow } from "@/components/ui/ChipRow";
import { AuthorLink } from "@/components/ui/AuthorLink";
import { ReportButton } from "@/components/ui/ReportButton";
import { TranslatableText } from "@/components/ui/TranslateButton";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ClickableCard } from "@/components/ui/ClickableCard";
import type { ExperienceCategory, ExperiencePost, User } from "@/lib/types";

const CATEGORY_OPTIONS: { value: ExperienceCategory | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "philosophy", label: "Philosophy" },
  { value: "starting-out", label: "Starting out" },
  { value: "milestones", label: "Milestones" },
  { value: "struggles", label: "Struggles & lessons" },
  { value: "curriculum-reviews", label: "Curriculum reviews" },
  { value: "reflections", label: "Reflections" },
];

// Mirrors the Situation type in src/app/onboarding/page.tsx — kept as a
// plain string union here (rather than a shared import) since this is the
// one place outside onboarding that needs it, and duplicating a 5-value
// union is cheaper than adding a shared types module for it.
type WelcomeSituation = "homeschooling" | "in-school" | "unschooling" | "want-to-know-more" | "new-way-of-learning";
const WELCOME_SITUATIONS: WelcomeSituation[] = ["homeschooling", "in-school", "unschooling", "want-to-know-more", "new-way-of-learning"];
function isWelcomeSituation(v: string | null): v is WelcomeSituation {
  return !!v && (WELCOME_SITUATIONS as string[]).includes(v);
}

// Draft copy — final wording is a Phase 6 task alongside the marketing page,
// not decided here. Four variants so every new member gets a card tuned to
// their onboarding answer, not just the ones "new" to the whole idea.
const EXPLORING_WELCOME = {
  title: "Welcome — glad you're here",
  body: (
    <>
      Since you&apos;re just starting to explore this, a couple of good places to begin: try the{" "}
      <strong>Philosophy</strong> tag right here on the Experience Board for the &quot;why,&quot; or the File
      Board&apos;s beginner picks for the &quot;how.&quot;
    </>
  ),
};

const WELCOME_COPY: Record<WelcomeSituation, { title: string; body: React.ReactNode }> = {
  "want-to-know-more": EXPLORING_WELCOME,
  "new-way-of-learning": EXPLORING_WELCOME,
  "in-school": {
    title: "Welcome — glad you're here",
    body: (
      <>
        AOEhub isn&apos;t just for homeschoolers — plenty of school families use it too, for extra practice material,
        a different way of thinking about learning, or just to see what else is out there. The{" "}
        <strong>Philosophy</strong> tag here on the Experience Board is a good place to see what this community
        actually believes, and the File Board has plenty worth browsing either way.
      </>
    ),
  },
  homeschooling: {
    title: "Welcome — glad to have you",
    body: (
      <>
        You&apos;re new to the hub, not to homeschooling — so you&apos;ve probably already got something worth
        sharing. Post about what&apos;s working (or isn&apos;t) on the Experience Board, and the File Board is full
        of curriculum other homeschooling families have already put through its paces.
      </>
    ),
  },
  unschooling: {
    title: "Welcome — glad to have you",
    body: (
      <>
        You&apos;re new to the hub, not to unschooling — this community values that perspective a lot. Share how
        it&apos;s actually going for you on the Experience Board, and check the File Board for resources other
        unschoolers have already found useful.
      </>
    ),
  },
};

const CATEGORY_LABELS: Record<ExperienceCategory, string> = {
  philosophy: "Philosophy",
  "starting-out": "Starting out",
  milestones: "Milestones",
  struggles: "Struggles & lessons",
  "curriculum-reviews": "Curriculum reviews",
  reflections: "Reflections",
  "just-sharing": "Just sharing",
};

export function ExperienceBoardClient({
  posts,
  authors,
}: {
  posts: ExperiencePost[];
  authors: Record<string, User | undefined>;
}) {
  const [filter, setFilter] = useState<ExperienceCategory | "all">("all");
  // Every new member gets a welcome card, tuned to their onboarding Q1
  // answer (see src/app/onboarding/page.tsx) — someone already
  // homeschooling/unschooling is new to the HUB, not the idea, so their
  // card is about sharing experience, not "here's what this is."
  const [welcomeSituation, setWelcomeSituation] = useState<WelcomeSituation | null>(null);

  useEffect(() => {
    const situation = window.localStorage.getItem("aoehub.welcomeSituation");
    if (isWelcomeSituation(situation)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWelcomeSituation(situation);
    }
    if (situation) window.localStorage.removeItem("aoehub.welcomeSituation");
  }, []);

  const pinned = posts.find((p) => p.isAnnouncement);
  const feed = posts.filter((p) => !p.isAnnouncement && (filter === "all" || p.category === filter));

  return (
    <>
      {pinned && (
        <div className="pin">
          <div className="row" style={{ gap: 6, marginBottom: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 17v5M8 3h8l-1 6 3 3H6l3-3z" />
            </svg>
            <span style={{ fontSize: 12, fontWeight: 500 }}>pinned announcement</span>
            <Badge>admin</Badge>
          </div>
          <p className="title" style={{ margin: "0 0 4px" }}>{pinned.title}</p>
          <p className="muted">{pinned.body}</p>
        </div>
      )}

      {welcomeSituation && (
        <Card style={{ background: "var(--pin-bg)", borderColor: "var(--pin-border)" }}>
          <p className="title" style={{ marginBottom: 4 }}>{WELCOME_COPY[welcomeSituation].title}</p>
          <p className="muted">{WELCOME_COPY[welcomeSituation].body}</p>
        </Card>
      )}

      <ChipRow options={CATEGORY_OPTIONS} value={filter} onChange={setFilter} />

      {feed.length === 0 && (
        <p className="muted">
          Nothing here yet — be the first to share something on the Experience Board.
        </p>
      )}

      {feed.map((post) => {
        const author = authors[post.authorId];
        return (
          <ClickableCard key={post.id} href={`/experience/${post.id}`}>
            <div className="row wrap" style={{ gap: 6, marginBottom: 6 }}>
              {author && <AuthorLink userId={author.id} name={author.name} />}
              {author?.isAdmin && <Badge>admin</Badge>}
              {!author?.isAdmin && post.category && <Badge>{CATEGORY_LABELS[post.category]}</Badge>}
              <span className="tiny">{timeAgo(post.createdAt)}</span>
              <ReportButton targetType="experience-post" targetId={post.id} />
            </div>
            {post.title && <p className="title" style={{ margin: "0 0 4px" }}>{post.title}</p>}
            <TranslatableText text={post.body} as="p" className="muted" />
            <p className="tiny">{post.views} views · {post.replyCount} replies</p>
          </ClickableCard>
        );
      })}
    </>
  );
}

function timeAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 14) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
}
