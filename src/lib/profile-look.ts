import type { CSSProperties } from "react";

// The cosmetic profile look (frame, background, post font): open to every
// account, never changes what anyone may do.
export const FRAME_SHADOW: Record<string, string> = {
  none: "none",
  gold: "0 0 0 3px #fff, 0 0 0 6px #d69e2e",
  leaf: "0 0 0 3px #fff, 0 0 0 6px #2f7d4f",
  sky: "0 0 0 3px #fff, 0 0 0 6px #3b82c4",
  double: "0 0 0 3px #fff, 0 0 0 5px #b7791f, 0 0 0 8px #fff, 0 0 0 10px #b7791f",
};
export const BACKGROUNDS: Record<string, { bg: string; color: string } | null> = {
  none: null,
  paper: { bg: "#f6efdf", color: "#2b2b2b" },
  sage: { bg: "#e4eee4", color: "#2b2b2b" },
  night: { bg: "#26304a", color: "#f2f2f2" },
};
export const FONTS: Record<string, string> = {
  default: "",
  serif: "Georgia, 'Times New Roman', serif",
  rounded: "'Trebuchet MS', 'Segoe UI', sans-serif",
  mono: "ui-monospace, Menlo, Consolas, monospace",
};

export const FRAME_CODES = ["none", "gold", "leaf", "sky", "double"] as const;
export const BACKGROUND_CODES = ["none", "paper", "sage", "night"] as const;
export const FONT_CODES = ["default", "serif", "rounded", "mono"] as const;

/** Background and font for a card or header that shows someone's content. */
export function lookStyle(look: { background?: string; postFont?: string }, withBackground = true): CSSProperties {
  const style: CSSProperties = {};
  const bg = BACKGROUNDS[look.background ?? "none"];
  if (withBackground && bg) {
    style.background = bg.bg;
    style.color = bg.color;
  }
  const font = FONTS[look.postFont ?? "default"];
  if (font) style.fontFamily = font;
  return style;
}

/** Only the font (for the text of a post). */
export function fontStyle(look: { postFont?: string }): CSSProperties {
  const font = FONTS[look.postFont ?? "default"];
  return font ? { fontFamily: font } : {};
}
