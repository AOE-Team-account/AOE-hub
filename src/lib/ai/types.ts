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
  /** Server signature of `text` + chat id + `ts`; sent back with the history so the server knows the answer is really its own. */
  sig?: string;
  /** When the server gave this answer (ms since 1970), part of the signature. */
  ts?: number;
}

export interface AIHistoryTurn {
  from: "ai" | "user";
  text: string;
  /** For "ai" turns: the signature and time the server gave that answer. */
  sig?: string;
  ts?: number;
}

export type { LanguageCode };
