import { chat } from "./ai.ts";
import { formatTimestamp, transcriptForPrompt } from "./format.ts";
import type { AiConfig } from "./settings.ts";
import type { Transcript } from "./types.ts";

export const SUMMARY_SYSTEM_PROMPT = `คุณคือเลขานุการการประชุมมืออาชีพ หน้าที่ของคุณคือสรุปบทถอดเสียงการประชุมเป็นรายงานการประชุมภาษาไทยที่ถูกต้องและอ่านง่าย

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

export function buildSummaryPrompt(t: Transcript): string {
  return (
    `ไฟล์: ${t.source}\nความยาว: ${formatTimestamp(t.duration, { ms: false })}\n\n` +
    `<transcript>\n${transcriptForPrompt(t)}\n</transcript>`
  );
}

/** Summarise with whichever AI the user configured. Returns Markdown. */
export function summarizeTranscript(t: Transcript, ai: AiConfig): Promise<string> {
  return chat(ai, { system: SUMMARY_SYSTEM_PROMPT, user: buildSummaryPrompt(t) });
}
