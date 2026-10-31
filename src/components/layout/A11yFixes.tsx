"use client";

import { useEffect } from "react";

// A safety net for form labels. Most forms write a visible label next to the
// field without linking the two, so a screen reader announces "edit text" with
// no name. This links each label to the field that follows it, and gives a
// field that only has placeholder text that text as its name. It runs on every
// page, including ones added later.
let counter = 0;
const CONTROLS = "input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea";

function fix(root: ParentNode) {
  root.querySelectorAll<HTMLLabelElement>("label.field-label:not([for])").forEach((label) => {
    if (label.querySelector(CONTROLS)) return;
    const next = label.nextElementSibling;
    const field = next?.matches(CONTROLS) ? (next as HTMLElement) : next?.querySelector<HTMLElement>(CONTROLS);
    if (!field) return;
    if (!field.id) field.id = `fld-${++counter}`;
    label.htmlFor = field.id;
  });
  root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input[placeholder]:not([type=hidden]),textarea[placeholder]").forEach((el) => {
    if (el.labels?.length || el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.title) return;
    el.setAttribute("aria-label", el.placeholder);
  });
}

export function A11yFixes() {
  useEffect(() => {
    fix(document);
    let pending = false;
    const observer = new MutationObserver(() => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; fix(document); });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
