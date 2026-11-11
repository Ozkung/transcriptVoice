import { Fragment, type ReactNode } from "react";
import { parseInline, parseMarkdown, type Block } from "@/lib/markdown.ts";

function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((r, i) => (r.bold ? <strong key={i}>{r.text}</strong> : <Fragment key={i}>{r.text}</Fragment>))}
    </>
  );
}

/** Renders the subset of Markdown that the meeting-minutes prompt produces. */
export default function Markdown({ source }: { source: string }) {
  const blocks = parseMarkdown(source);
  const out: ReactNode[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.kind === "bullet" || b.kind === "numbered") {
      const items: Block[] = [];
      while (i < blocks.length && blocks[i].kind === b.kind) items.push(blocks[i++]);
      i--;
      const List = b.kind === "bullet" ? "ul" : "ol";
      out.push(
        <List key={i}>
          {items.map((it, j) => (
            <li key={j}>
              <Inline text={(it as { text: string }).text} />
            </li>
          ))}
        </List>,
      );
    } else if (b.kind === "heading") {
      const H = (`h${Math.min(b.level + 1, 4)}`) as "h2" | "h3" | "h4";
      out.push(
        <H key={i}>
          <Inline text={b.text} />
        </H>,
      );
    } else if (b.kind === "table") {
      const [head, ...rows] = b.rows;
      out.push(
        <table key={i}>
          <thead>
            <tr>{head.map((c, j) => <th key={j}><Inline text={c} /></th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>{head.map((_, j) => <td key={j}><Inline text={r[j] ?? ""} /></td>)}</tr>
            ))}
          </tbody>
        </table>,
      );
    } else {
      out.push(
        <p key={i}>
          <Inline text={b.text} />
        </p>,
      );
    }
  }
  return <div className="summary">{out}</div>;
}
