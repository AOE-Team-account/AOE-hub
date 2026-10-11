// Site-wide constants that are placeholders until the owner supplies them.

// The contact address shown to someone whose account is suspended or deleted.
// PLACEHOLDER: null until the real address is chosen (it is also needed for
// the footer "Contact" link). When set, the messages below mention it.
export const CONTACT_EMAIL: string | null = null;

export function contactSentence(): string {
  return CONTACT_EMAIL
    ? `If you think this is a mistake, contact us at ${CONTACT_EMAIL}.`
    : "If you think this is a mistake, contact details will be added here before the hub opens.";
}
