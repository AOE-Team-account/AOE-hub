import type { UiKey } from "@/lib/i18n/strings";

// The policy pages, in footer order. (Content, Community and Safety rules now live inside the Terms and Conditions; takedown inside Copyright / DMCA.) Each has a markdown text per official
// language in content/policies/{slug}.{en|zh-CN}.md.
export const POLICY_SLUGS = ["terms", "privacy", "copyright", "about", "contact"] as const;
export type PolicySlug = (typeof POLICY_SLUGS)[number];

export const POLICY_NAME_KEYS: Record<PolicySlug, UiKey> = {
  terms: "policy.name.terms",
  privacy: "policy.name.privacy",
  copyright: "policy.name.copyright",
  about: "policy.name.about",
  contact: "policy.name.contact",
};

export const isPolicySlug = (s: string): s is PolicySlug => (POLICY_SLUGS as readonly string[]).includes(s);
