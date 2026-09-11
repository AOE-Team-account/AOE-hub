import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary" | "danger";
  size?: "default" | "small";
}

export function Button({ variant = "default", size = "default", className = "", ...props }: ButtonProps) {
  const classes = ["btn", variant !== "default" ? variant : "", size === "small" ? "small" : "", className]
    .filter(Boolean)
    .join(" ");
  return <button className={classes} {...props} />;
}
