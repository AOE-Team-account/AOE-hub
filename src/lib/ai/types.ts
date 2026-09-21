import type { LanguageCode } from "@/lib/types";

export interface AISource {
  title: string;
  href?: string;
}

export interface AIReply {
  text: string;
  sources: AISource[];
  /** True when the assistant isn't confident and the question should go to the admins. */
  escalate: boolean;
}

export interface AIHistoryTurn {
  from: "ai" | "user";
  text: string;
}

export type { LanguageCode };
