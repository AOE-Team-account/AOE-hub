import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRequestLanguage } from "@/lib/i18n/server";
import { loadPolicy } from "@/lib/policies/load";
import { POLICY_SLUGS } from "@/lib/policies/slugs";
import { PolicyView } from "@/components/policy/PolicyView";

export function generateStaticParams() {
  return POLICY_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const doc = loadPolicy(slug, "en");
  return { title: doc ? `${doc.title} — AOEhub` : "AOEhub" };
}

export default async function PolicyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { lang } = await getRequestLanguage();
  const doc = loadPolicy(slug, lang);
  if (!doc) notFound();
  return (
    <>
      <PolicyView doc={doc} />
    </>
  );
}
