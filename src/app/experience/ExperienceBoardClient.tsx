"use client";

import { useEffect, useState } from "react";
import { ChipRow } from "@/components/ui/ChipRow";
import { AuthorLink } from "@/components/ui/AuthorLink";
import { ReportButton } from "@/components/ui/ReportButton";
import { Translated } from "@/components/ui/Translated";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ClickableCard } from "@/components/ui/ClickableCard";
import { useLanguage } from "@/contexts/LanguageContext";
import { rich } from "@/lib/i18n/rich";
import type { UiKey } from "@/lib/i18n/strings";
import type { ExperienceCategory, ExperiencePost, User } from "@/lib/types";

const CATEGORY_OPTION_KEYS: { value: ExperienceCategory | "all"; key: UiKey }[] = [
  { value: "all", key: "exp.cat.all" },
  { value: "question", key: "exp.cat.question" },
  { value: "philosophy", key: "exp.cat.philosophy" },
  { value: "starting-out", key: "exp.cat.startingOut" },
  { value: "milestones", key: "exp.cat.milestones" },
  { value: "struggles", key: "exp.cat.struggles" },
  { value: "curriculum-reviews", key: "exp.cat.curriculumReviews" },
  { value: "reflections", key: "exp.cat.reflections" },
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

// Draft copy — final wording is a Phase 6b task alongside the marketing page.
// Four variants so every new member gets a card tuned to their onboarding
// answer, not just the ones "new" to the whole idea.
const WELCOME_KEYS: Record<WelcomeSituation, { title: UiKey; body: UiKey }> = {
  "want-to-know-more": { title: "welcome.exploring.title", body: "welcome.exploring.body" },
  "new-way-of-learning": { title: "welcome.exploring.title", body: "welcome.exploring.body" },
  "in-school": { title: "welcome.inSchool.title", body: "welcome.inSchool.body" },
  homeschooling: { title: "welcome.homeschooling.title", body: "welcome.homeschooling.body" },
  unschooling: { title: "welcome.unschooling.title", body: "welcome.unschooling.body" },
};

const CATEGORY_LABEL_KEYS: Record<ExperienceCategory, UiKey> = {
  question: "exp.cat.question",
  philosophy: "exp.cat.philosophy",
  "starting-out": "exp.cat.startingOut",
  milestones: "exp.cat.milestones",
  struggles: "exp.cat.struggles",
  "curriculum-reviews": "exp.cat.curriculumReviews",
  reflections: "exp.cat.reflections",
  "just-sharing": "exp.cat.justSharing",
};

export function ExperienceBoardClient({
  posts,
  authors,
}: {
  posts: ExperiencePost[];
  authors: Record<string, User | undefined>;
}) {
  const { t } = useLanguage();
  const categoryOptions = CATEGORY_OPTION_KEYS.map((o) => ({ value: o.value, label: t(o.key) }));
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
  const isAnswerer = (authorId: string) => authors[authorId]?.badges.includes("answerer") ?? false;
  // Answerers' posts are pinned to the top of the board (newest first within
  // each group). Posts arrive newest first, so a stable split keeps that order.
  const matching = posts.filter((p) => !p.isAnnouncement && (filter === "all" || p.category === filter));
  const feed = [...matching.filter((p) => isAnswerer(p.authorId)), ...matching.filter((p) => !isAnswerer(p.authorId))];

  return (
    <>
      {pinned && (
        <div className="pin">
          <div className="row" style={{ gap: 6, marginBottom: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 17v5M8 3h8l-1 6 3 3H6l3-3z" />
            </svg>
            <span style={{ fontSize: 12, fontWeight: 500 }}>{t("exp.pinnedAnnouncement")}</span>
            <Badge>AOEhub</Badge>
          </div>
          {pinned.title && <Translated type="experience-post" id={pinned.id} field="title" text={pinned.title} className="title" style={{ margin: "0 0 4px" }} />}
          <Translated type="experience-post" id={pinned.id} field="body" text={pinned.body} className="muted" note />
        </div>
      )}

      {welcomeSituation && (
        <Card style={{ background: "var(--pin-bg)", borderColor: "var(--pin-border)" }}>
          <p className="title" style={{ marginBottom: 4 }}>{t(WELCOME_KEYS[welcomeSituation].title)}</p>
          <p className="muted">{rich(t(WELCOME_KEYS[welcomeSituation].body), { b: (c) => <strong>{c}</strong> })}</p>
        </Card>
      )}

      <ChipRow options={categoryOptions} value={filter} onChange={setFilter} />

      {feed.length === 0 && (
        <p className="muted">
          {t("exp.empty")}
        </p>
      )}

      {feed.map((post) => {
        const author = authors[post.authorId];
        return (
          <ClickableCard key={post.id} href={`/experience/${post.id}`}>
            <div className="row wrap" style={{ gap: 6, marginBottom: 6 }}>
              {post.isAnnouncement ? <span style={{ fontWeight: 500, fontSize: 13 }}>AOEhub</span> : author && <AuthorLink userId={author.id} name={author.name} badges={author.badges} />}
              {post.isAnnouncement ? <Badge>{t("exp.fromAoehub")}</Badge> : post.category && <Badge>{t(CATEGORY_LABEL_KEYS[post.category])}</Badge>}
              {isAnswerer(post.authorId) && <Badge variant="neutral">{t("exp.pinned")}</Badge>}
              {post.madeWithAi && <Badge variant="neutral">{t("badge.madeWithAi")}</Badge>}
              <span className="tiny">{timeAgo(post.createdAt, t)}</span>
              <ReportButton targetType="experience-post" targetId={post.id} />
            </div>
            {post.title && <Translated type="experience-post" id={post.id} field="title" text={post.title} className="title" style={{ margin: "0 0 4px" }} />}
            {post.imageId && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/media/${post.imageId}`} alt="" loading="lazy" style={{ maxWidth: "100%", maxHeight: 260, borderRadius: 10, margin: "4px 0 8px", display: "block" }} />
            )}
            <Translated type="experience-post" id={post.id} field="body" text={post.body} className="muted" note />
            <p className="tiny">{t("exp.viewsReplies", { views: post.views, replies: post.replyCount })}</p>
          </ClickableCard>
        );
      })}
    </>
  );
}

function timeAgo(iso: string, t: (key: UiKey, params?: Record<string, string | number>) => string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return t("time.today");
  if (days === 1) return t("time.dayAgo");
  if (days < 14) return t("time.daysAgo", { n: days });
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? t("time.weekAgo") : t("time.weeksAgo", { n: weeks });
}
