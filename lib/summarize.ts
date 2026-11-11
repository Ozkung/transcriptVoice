import Anthropic from "@anthropic-ai/sdk";
import { formatTimestamp, transcriptForPrompt } from "./format.ts";
import type { Transcript } from "./types.ts";

export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

const SYSTEM_PROMPT = `คุณคือเลขานุการการประชุมมืออาชีพ หน้าที่ของคุณคือสรุปบทถอดเสียงการประชุมเป็นรายงานการประชุมภาษาไทยที่ถูกต้องและอ่านง่าย

ตอบเป็น Markdown โดยใช้หัวข้อต่อไปนี้ตามลำดับ:
## สรุปภาพรวม
## ประเด็นที่หารือ
## มติ / ข้อตัดสินใจ
## งานที่ต้องดำเนินการ (Action Items)
(ตาราง Markdown คอลัมน์: งาน | ผู้รับผิดชอบ | กำหนดเสร็จ — ถ้าไม่ทราบให้ใส่ "-")
## คำถาม / ประเด็นค้างพิจารณา

ใช้เฉพาะข้อมูลที่ปรากฏในบทถอดเสียง ห้ามแต่งเติม ถ้าหัวข้อใดไม่มีข้อมูลให้เขียนว่า "ไม่มี"
อ้างอิงเวลา [HH:MM:SS] ของประเด็นสำคัญเมื่อเหมาะสม
บทถอดเสียงมาจากระบบถอดเสียงอัตโนมัติ อาจมีคำผิดจากการฟัง ให้ตีความตามบริบทอย่างระมัดระวัง`;

export class MissingApiKeyError extends Error {}

export async function summarizeTranscript(t: Transcript): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw new MissingApiKeyError("ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY ในไฟล์ .env.local");
  }
  const client = new Anthropic();
  const userContent =
    `ไฟล์: ${t.source}\nความยาว: ${formatTimestamp(t.duration, { ms: false })}\n\n` +
    `<transcript>\n${transcriptForPrompt(t)}\n</transcript>`;

  const stream = client.beta.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: 64000,
    system: SYSTEM_PROMPT,
    output_config: { effort: "medium" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{ role: "user", content: userContent }],
  });
  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") throw new Error("โมเดลปฏิเสธการสรุปเนื้อหานี้");
  let text = message.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  if (message.stop_reason === "max_tokens") text += "\n\n_(สรุปถูกตัดเนื่องจากยาวเกินขีดจำกัด)_";
  return text;
}
