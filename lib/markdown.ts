/** Tiny Markdown block parser (headings, lists, tables, paragraphs) shared by the UI and the .docx exporter. */

export type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "numbered"; text: string }
  | { kind: "table"; rows: string[][] }
  | { kind: "paragraph"; text: string };

export function parseMarkdown(md: string): Block[] {
  const lines = md.split(/\r?\n/);
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trimEnd();
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.trimStart().startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trimStart().startsWith("|")) {
        const cells = lines[i].trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
        const isDivider = cells.every((c) => !c || /^:?-{2,}:?$/.test(c));
        if (!isDivider) rows.push(cells);
        i++;
      }
      if (rows.length) blocks.push({ kind: "table", rows });
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) blocks.push({ kind: "heading", level: m[1].length, text: m[2].trim() });
    else if ((m = line.match(/^\s*[-*]\s+(.*)$/))) blocks.push({ kind: "bullet", text: m[1] });
    else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) blocks.push({ kind: "numbered", text: m[1] });
    else blocks.push({ kind: "paragraph", text: line.trim() });
    i++;
  }
  return blocks;
}

/** Split "a **b** c" into runs: [{text:"a ",bold:false},{text:"b",bold:true},...] */
export function parseInline(text: string): { text: string; bold: boolean }[] {
  return text
    .split("**")
    .map((part, idx) => ({ text: part, bold: idx % 2 === 1 }))
    .filter((r) => r.text);
}
