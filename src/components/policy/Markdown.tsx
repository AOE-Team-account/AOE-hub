import Link from "next/link";
import { Fragment, type ReactNode } from "react";

// A tiny, safe renderer for the policy texts: ## / ### headings, paragraphs,
// "-" lists, "|" tables, ">" notes, **bold**, `code`, [text](/path or https://…)
// and [[placeholders]] (shown highlighted: they still need an answer).
// Nothing is ever inserted as HTML, so machine-translated text is safe too.

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\[\[([^\]]+)\]\]|\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyBase}-${n++}`;
    if (m[1] != null) out.push(<mark key={key} className="policy-todo">{m[1]}</mark>);
    else if (m[2] != null) out.push(<strong key={key}>{m[2]}</strong>);
    else if (m[3] != null) out.push(<code key={key}>{m[3]}</code>);
    else {
      const href = m[5];
      if (/^\/[^/]/.test(href) || href === "/") out.push(<Link key={key} href={href} style={{ color: "var(--accent-link)" }}>{m[4]}</Link>);
      else if (/^https:\/\//.test(href)) out.push(<a key={key} href={href} rel="noopener noreferrer" target="_blank" style={{ color: "var(--accent-link)" }}>{m[4]}</a>);
      else out.push(m[4]);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  // Bare email addresses become mail links.
  return out.flatMap<ReactNode>((part, i) =>
    typeof part !== "string"
      ? [part]
      : part.split(/([A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/).map((seg, j) =>
          j % 2 === 1 ? <a key={`${keyBase}-m${i}-${j}`} href={`mailto:${seg}`} style={{ color: "var(--accent-link)" }}>{seg}</a> : <Fragment key={`${keyBase}-t${i}-${j}`}>{seg}</Fragment>
        )
  );
}

const cells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const key = `b${k++}`;
    const h = line.match(/^(#{2,3})\s+(.*)$/);
    if (h) {
      blocks.push(h[1].length === 2 ? <h2 key={key} className="policy-h2">{inline(h[2], key)}</h2> : <h3 key={key} className="policy-h3">{inline(h[2], key)}</h3>);
      i++;
    } else if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ""));
      blocks.push(<ul key={key} className="policy-list">{items.map((it, j) => <li key={j}>{inline(it, `${key}-${j}`)}</li>)}</ul>);
    } else if (line.trim().startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) rows.push(cells(lines[i]));
        i++;
      }
      const [head, ...body] = rows;
      blocks.push(
        <div key={key} style={{ overflowX: "auto" }}>
          <table className="policy-table">
            <thead><tr>{head.map((c, j) => <th key={j}>{inline(c, `${key}h${j}`)}</th>)}</tr></thead>
            <tbody>{body.map((r, j) => <tr key={j}>{r.map((c, l) => <td key={l}>{inline(c, `${key}-${j}-${l}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    } else if (line.startsWith(">")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) quote.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push(<blockquote key={key} className="policy-note">{inline(quote.join(" "), key)}</blockquote>);
    } else {
      const para: string[] = [line];
      i++;
      while (i < lines.length && lines[i].trim() && !/^(#{2,3}\s|\s*[-*]\s|\||>)/.test(lines[i])) para.push(lines[i++]);
      blocks.push(<p key={key} className="policy-p">{inline(para.join(" "), key)}</p>);
    }
  }
  return <>{blocks}</>;
}
