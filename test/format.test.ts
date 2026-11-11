import assert from "node:assert/strict";
import { test } from "node:test";
import { formatTimestamp, safeBaseName, toMarkdown, toSrt, toTxt, toVtt } from "../lib/format.ts";
import { parseInline, parseMarkdown } from "../lib/markdown.ts";
import type { Transcript } from "../lib/types.ts";

const sample: Transcript = {
  source: "ประชุมทีม.mp4",
  language: "th",
  duration: 3725.5,
  segments: [
    { start: 0, end: 2.5, text: "สวัสดีครับ เริ่มการประชุม" },
    { start: 3661.25, end: 3665, text: "ปิดการประชุม" },
  ],
};

test("formatTimestamp", () => {
  assert.equal(formatTimestamp(3661.25), "01:01:01,250");
  assert.equal(formatTimestamp(3661.25, { sep: "." }), "01:01:01.250");
  assert.equal(formatTimestamp(59.4, { ms: false }), "00:00:59");
  assert.equal(formatTimestamp(-3), "00:00:00,000");
});

test("srt / vtt / txt", () => {
  assert.ok(toSrt(sample).startsWith("1\n00:00:00,000 --> 00:00:02,500\nสวัสดีครับ"));
  assert.ok(toSrt(sample).includes("2\n01:01:01,250 --> 01:01:05,000\nปิดการประชุม"));
  assert.ok(toVtt(sample).startsWith("WEBVTT\n\n00:00:00.000 --> 00:00:02.500"));
  assert.equal(toTxt(sample).split("\n")[1], "[01:01:01] ปิดการประชุม");
});

test("markdown document includes summary and transcript", () => {
  const md = toMarkdown(sample, "ประชุมทีม", "## สรุปภาพรวม\nเนื้อหา");
  assert.ok(md.startsWith("# ประชุมทีม"));
  assert.ok(md.includes("# รายงานสรุปการประชุม"));
  assert.ok(md.includes("**[00:00:00]** สวัสดีครับ"));
});

test("safeBaseName keeps Thai, strips unsafe chars", () => {
  assert.equal(safeBaseName("ประชุม/ทีม:1.mp4"), "ประชุม_ทีม_1");
  assert.equal(safeBaseName(".mp4"), "transcript");
});

test("parseMarkdown", () => {
  const blocks = parseMarkdown("## หัวข้อ\n- ข้อ **หนึ่ง**\n1. ลำดับ\n\n| งาน | คน |\n|---|---|\n| ก | ข |\nย่อหน้า");
  assert.deepEqual(blocks.map((b) => b.kind), ["heading", "bullet", "numbered", "table", "paragraph"]);
  assert.deepEqual((blocks[3] as { rows: string[][] }).rows, [["งาน", "คน"], ["ก", "ข"]]);
  assert.deepEqual(parseInline("a **b** c"), [
    { text: "a ", bold: false },
    { text: "b", bold: true },
    { text: " c", bold: false },
  ]);
});
