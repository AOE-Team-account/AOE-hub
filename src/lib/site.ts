import type { TParams, UiKey } from "@/lib/i18n/strings";

// Site-wide constants that are placeholders until the owner supplies them.

// The contact address shown to someone whose account is suspended or deleted.
// PLACEHOLDER: null until the real address is chosen (it is also needed for
// the footer "Contact" link). When set, the messages below mention it.
export const CONTACT_EMAIL: string | null = null;

/** The "contact us if this is a mistake" sentence, in the reader's language. */
export function contactSentence(t: (key: UiKey, params?: TParams) => string): string {
  return CONTACT_EMAIL ? t("contact.mistakeWithEmail", { email: CONTACT_EMAIL }) : t("contact.mistakeNoEmail");
}
