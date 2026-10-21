import type { TParams, UiKey } from "@/lib/i18n/strings";

// Site-wide constants that are placeholders until the owner supplies them.

// The contact address shown to someone whose account is suspended or deleted.
// The hub's official address (given by Clara, 2026-10-21). Also used for the
// footer "Contact" link and the policy pages.
export const CONTACT_EMAIL: string | null = "info@aoe.name";

/** The "contact us if this is a mistake" sentence, in the reader's language. */
export function contactSentence(t: (key: UiKey, params?: TParams) => string): string {
  return CONTACT_EMAIL ? t("contact.mistakeWithEmail", { email: CONTACT_EMAIL }) : t("contact.mistakeNoEmail");
}
