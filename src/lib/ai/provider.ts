import type { LanguageCode } from "@/lib/types";

export interface AIProvider {
  /** Answer a general question, or route to "ask the admins" if unconfident. */
  reply(message: string, lang: LanguageCode): Promise<string>;
}
