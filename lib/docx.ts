import {
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { formatTimestamp, headerInfo } from "./format.ts";
import { parseInline, parseMarkdown } from "./markdown.ts";
import type { Transcript } from "./types.ts";

const FONT = "TH Sarabun New";
const font = { ascii: FONT, hAnsi: FONT, cs: FONT, eastAsia: FONT };

const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4];

function runs(text: string, extra: { bold?: boolean } = {}): TextRun[] {
  return parseInline(text).map((r) => new TextRun({ text: r.text, bold: r.bold || extra.bold, font }));
}

function table(rows: string[][], headerRow: boolean): Table {
  const cols = Math.max(...rows.map((r) => r.length));
  const border = { style: BorderStyle.SINGLE, size: 4, color: "999999" };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: rows.map(
      (row, r) =>
        new TableRow({
          tableHeader: headerRow && r === 0,
          children: Array.from({ length: cols }, (_, c) =>
            new TableCell({
              children: [new Paragraph({ children: runs(row[c] ?? "", { bold: headerRow && r === 0 }) })],
            }),
          ),
        }),
    ),
  });
}

function markdownToDocx(md: string): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  for (const b of parseMarkdown(md)) {
    switch (b.kind) {
      case "heading":
        out.push(new Paragraph({ heading: HEADINGS[Math.min(Math.max(b.level, 2), 4) - 1], children: runs(b.text) }));
        break;
      case "bullet":
        out.push(new Paragraph({ bullet: { level: 0 }, children: runs(b.text) }));
        break;
      case "numbered":
        out.push(new Paragraph({ numbering: { reference: "numbered", level: 0 }, children: runs(b.text) }));
        break;
      case "table":
        out.push(table(b.rows, true), new Paragraph({}));
        break;
      default:
        out.push(new Paragraph({ children: runs(b.text) }));
    }
  }
  return out;
}

export async function buildDocx(t: Transcript, title: string, summary?: string): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: title, font })] }),
    table(headerInfo(t), false),
    new Paragraph({}),
  ];

  if (summary?.trim()) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "รายงานสรุปการประชุม", font })] }));
    children.push(...markdownToDocx(summary));
  }

  children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "บทถอดเสียงฉบับเต็ม", font })] }));
  for (const s of t.segments) {
    children.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({ text: `[${formatTimestamp(s.start, { ms: false })}] `, bold: true, color: "666666", font }),
          new TextRun({ text: s.text, font }),
        ],
      }),
    );
  }

  const headingRun = { font, color: "1F3864" };
  const doc = new Document({
    creator: "TranscriptVoice",
    title,
    styles: {
      default: {
        document: { run: { font, size: 30, sizeComplexScript: 30 } }, // 15pt
        title: { run: { ...headingRun, size: 48, sizeComplexScript: 48, bold: true } },
        heading1: { run: { ...headingRun, size: 40, sizeComplexScript: 40, bold: true } },
        heading2: { run: { ...headingRun, size: 34, sizeComplexScript: 34, bold: true } },
        heading3: { run: { ...headingRun, size: 32, sizeComplexScript: 32, bold: true } },
        heading4: { run: { ...headingRun, size: 30, sizeComplexScript: 30, bold: true } },
      },
    },
    numbering: {
      config: [{ reference: "numbered", levels: [{ level: 0, format: "decimal", text: "%1.", alignment: "left" }] }],
    },
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}
