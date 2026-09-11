import type { HTMLAttributes } from "react";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "warn" | "neutral";
}

export function Badge({ variant = "default", className = "", ...props }: BadgeProps) {
  const classes = ["badge", variant !== "default" ? variant : "", className].filter(Boolean).join(" ");
  return <span className={classes} {...props} />;
}
