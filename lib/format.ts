import type { Transcript } from "./types.ts";

/** 3661.25 -> "01:01:01,250" (SRT) / "01:01:01.250" (VTT) / "01:01:01" */
export function formatTimestamp(seconds: number, opts: { sep?: string; ms?: boolean } = {}): string {
  const { sep = ",", ms = true } = opts;
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(totalMs / 3_600_000);
  const m = Math.floor((totalMs % 3_600_000) / 60_000);
  const s = Math.floor((totalMs % 60_000) / 1000);
  const rest = totalMs % 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const base = `${pad(h)}:${pad(m)}:${pad(s)}`;
  return ms ? `${base}${sep}${pad(rest, 3)}` : base;
}

const hms = (s: number) => formatTimestamp(s, { ms: false });

export function toTxt(t: Transcript): string {
  return t.segments.map((s) => `[${hms(s.start)}] ${s.text}`).join("\n") + "\n";
}

export function toSrt(t: Transcript): string {
  return t.segments
    .map((s, i) => `${i + 1}\n${formatTimestamp(s.start)} --> ${formatTimestamp(s.end)}\n${s.text}\n`)
    .join("\n");
}

export function toVtt(t: Transcript): string {
  const body = t.segments
    .map((s) => `${formatTimestamp(s.start, { sep: "." })} --> ${formatTimestamp(s.end, { sep: "." })}\n${s.text}\n`)
    .join("\n");
  return `WEBVTT\n\n${body}`;
}

export function toJson(t: Transcript, summary?: string): string {
  return JSON.stringify(summary ? { ...t, summary } : t, null, 2);
}

export function headerInfo(t: Transcript, now = new Date()): [string, string][] {
  return [
    ["ไฟล์ต้นฉบับ", t.source],
    ["ความยาว", hms(t.duration)],
    ["ภาษา", t.language],
    ["วันที่สร้างเอกสาร", now.toLocaleString("th-TH", { dateStyle: "long", timeStyle: "short" })],
  ];
}

export function toMarkdown(t: Transcript, title: string, summary?: string): string {
  const out = [`# ${title}`, "", ...headerInfo(t).map(([k, v]) => `- **${k}:** ${v}`), ""];
  if (summary?.trim()) out.push("# รายงานสรุปการประชุม", "", summary.trim(), "");
  out.push("# บทถอดเสียงฉบับเต็ม", "");
  for (const s of t.segments) out.push(`**[${hms(s.start)}]** ${s.text}  `);
  return out.join("\n") + "\n";
}

/** Transcript as plain text with timestamps, used as Claude input. */
export function transcriptForPrompt(t: Transcript): string {
  return t.segments.map((s) => `[${hms(s.start)}] ${s.text}`).join("\n");
}

/** Make a filename-safe base name (keeps Thai characters). */
export function safeBaseName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|\x00-\x1f]+/g, "_").trim();
  return base || "transcript";
}
