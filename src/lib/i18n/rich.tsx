import { Fragment, type ReactNode } from "react";

/**
 * Turns a translated string with simple tags into React nodes, so sentences
 * that contain a link, bold text or a small note stay one translatable unit
 * (word order differs between languages):
 *
 *   rich("Sign up or <b>log in</b> — <a>it's free</a>.", { b: (c) => <strong>{c}</strong>, a: (c) => <Link ...>{c}</Link> })
 *
 * Tags cannot be nested. Unknown tags are shown as plain text.
 */
export function rich(text: string, tags: Record<string, (children: ReactNode) => ReactNode>): ReactNode {
  const parts: ReactNode[] = [];
  const re = /<(\w+)>([\s\S]*?)<\/\1>/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let n = 0;
  while ((match = re.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const render = tags[match[1]];
    parts.push(<Fragment key={n++}>{render ? render(match[2]) : match[2]}</Fragment>);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
