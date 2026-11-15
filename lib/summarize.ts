import Anthropic from "@anthropic-ai/sdk";
import { formatTimestamp, transcriptForPrompt } from "./format.ts";
import { CLAUDE_MODELS, DEFAULT_CLAUDE_MODEL } from "./settings.ts";
import type { Transcript } from "./types.ts";

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

export interface ClaudeOptions {
  /** Key typed by the user in Settings. Falls back to ANTHROPIC_API_KEY on the server. */
  apiKey?: string;
  model?: string;
}

export function resolveModel(model?: string): string {
  if (model && CLAUDE_MODELS.some((m) => m.id === model)) return model;
  const envModel = process.env.CLAUDE_MODEL;
  return envModel || DEFAULT_CLAUDE_MODEL;
}

export function createClient(apiKey?: string): Anthropic {
  const key = apiKey?.trim();
  if (key) return new Anthropic({ apiKey: key });
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw new MissingApiKeyError("ยังไม่ได้ใส่ Claude API Key — กดปุ่ม ⚙ ตั้งค่า ที่มุมขวาบนเพื่อใส่ Key ของคุณ");
  }
  return new Anthropic();
}

/** Cheap check that a key works: listing models costs no tokens. */
export async function verifyApiKey(apiKey: string): Promise<void> {
  await createClient(apiKey).models.list({ limit: 1 });
}

export async function summarizeTranscript(t: Transcript, opts: ClaudeOptions = {}): Promise<string> {
  const client = createClient(opts.apiKey);
  const model = resolveModel(opts.model);
  const userContent =
    `ไฟล์: ${t.source}\nความยาว: ${formatTimestamp(t.duration, { ms: false })}\n\n` +
    `<transcript>\n${transcriptForPrompt(t)}\n</transcript>`;

  // Server-side refusal fallback is available for Opus 5.5 / Sonnet 5.5, not Haiku 5.5.
  const withFallback = model !== "claude-haiku-5-5";
  const stream = client.beta.messages.stream({
    model,
    max_tokens: 64000,
    system: SYSTEM_PROMPT,
    output_config: { effort: "medium" },
    ...(withFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
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
