import type { LanguageCode } from "@/lib/types";

export interface AISource {
  title: string;
  href?: string;
}

export interface AIReply {
  text: string;
  sources: AISource[];
  /** True when the assistant isn't confident and the question should be offered the chance to post it on the Experience Board. */
  escalate: boolean;
  /** True when the question is not for the hub AI: the member is shown links to other AI assistants. */
  offTopic?: boolean;
  /** Server signature of `text`; sent back with the history so the server knows the answer is really its own. */
  sig?: string;
}

export interface AIHistoryTurn {
  from: "ai" | "user";
  text: string;
  /** For "ai" turns: the signature the server gave that answer. */
  sig?: string;
}

export type { LanguageCode };
