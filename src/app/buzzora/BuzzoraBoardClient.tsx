"use client";

import { useMemo, useState } from "react";
import { ChipRow } from "@/components/ui/ChipRow";
import { ReportButton } from "@/components/ui/ReportButton";
import { Translated } from "@/components/ui/Translated";
import { Badge } from "@/components/ui/Badge";
import { ClickableCard } from "@/components/ui/ClickableCard";
import { BuzzSources } from "@/components/buzzora/BuzzSources";
import { BuzzComposer } from "@/components/buzzora/StaffTools";
import { useLanguage } from "@/contexts/LanguageContext";
import type { UiKey } from "@/lib/i18n/strings";
import type { BuzzKind, ExperiencePost } from "@/lib/types";

const TAB_KEYS: Record<BuzzKind, UiKey> = { news: "buzz.tab.news", law: "buzz.tab.law", regulation: "buzz.tab.regulation" };

export function BuzzoraBoardClient({ posts }: { posts: ExperiencePost[] }) {
  const { t, lang } = useLanguage();
  const [tab, setTab] = useState<BuzzKind | "all">("all");
  const [country, setCountry] = useState("");

  const countries = useMemo(() => [...new Set(posts.map((p) => p.country).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b)), [posts]);
  const shown = posts.filter((p) => (tab === "all" || p.buzzKind === tab) && (!country || p.country === country));
  const tabOptions = [
    { value: "all" as const, label: t("exp.cat.all") },
    ...(["news", "law", "regulation"] as BuzzKind[]).map((k) => ({ value: k, label: t(TAB_KEYS[k]) })),
  ];

  return (
    <>
      <p role="heading" aria-level={1} className="title" style={{ marginBottom: 4 }}>{t("tabs.buzzora")}</p>
      <p className="muted" style={{ marginTop: 0 }}>{t("buzz.intro")}</p>
      <BuzzComposer />
      <ChipRow options={tabOptions} value={tab} onChange={setTab} />
      {countries.length > 0 && (
        <div style={{ margin: "0 0 10px" }}>
          <select aria-label={t("buzz.country.label")} value={country} onChange={(e) => setCountry(e.target.value)} style={{ width: "auto", maxWidth: "100%" }}>
            <option value="">{t("buzz.country.all")}</option>
            {countries.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}

      {shown.length === 0 && <p className="muted">{t("buzz.empty")}</p>}

      {shown.map((post) => (
        <ClickableCard key={post.id} href={`/buzzora/${post.id}`}>
          <div className="row wrap" style={{ gap: 6, marginBottom: 6 }}>
            <span style={{ fontWeight: 500, fontSize: 13 }}>AOEhub</span>
            {post.buzzKind && <Badge>{t(TAB_KEYS[post.buzzKind])}</Badge>}
            {post.country && <Badge variant="neutral">{post.country}</Badge>}
            <span className="tiny">{new Date(post.createdAt).toLocaleDateString(lang)}</span>
            <ReportButton targetType="experience-post" targetId={post.id} />
          </div>
          {post.title && <Translated type="experience-post" id={post.id} field="title" text={post.title} className="title" style={{ margin: "0 0 4px" }} />}
          <Translated type="experience-post" id={post.id} field="body" text={post.body} className="muted" note />
          {post.sources && <BuzzSources sources={post.sources} />}
          <p className="tiny" style={{ margin: "2px 0" }}>{post.isAi ? t("buzz.aiLabel") : t("buzz.staffLabel")}</p>
          <p className="tiny">{t("exp.viewsReplies", { views: post.views, replies: post.replyCount })}</p>
        </ClickableCard>
      ))}
    </>
  );
}
