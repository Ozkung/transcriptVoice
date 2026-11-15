import Anthropic from "@anthropic-ai/sdk";
import { MissingApiKeyError } from "@/lib/summarize.ts";

/** Map Claude/SDK errors to a Thai JSON response. Never echoes the API key. */
export function claudeErrorResponse(e: unknown): Response {
  if (e instanceof MissingApiKeyError) return Response.json({ error: e.message }, { status: 400 });
  if (e instanceof Anthropic.AuthenticationError)
    return Response.json({ error: "API Key ไม่ถูกต้องหรือถูกยกเลิกแล้ว — ตรวจสอบในหน้าตั้งค่า" }, { status: 401 });
  if (e instanceof Anthropic.PermissionDeniedError)
    return Response.json({ error: "API Key นี้ไม่มีสิทธิ์ใช้งานโมเดลที่เลือก" }, { status: 403 });
  if (e instanceof Anthropic.NotFoundError)
    return Response.json({ error: "ไม่พบโมเดลที่เลือก ลองเปลี่ยนโมเดลในหน้าตั้งค่า" }, { status: 404 });
  if (e instanceof Anthropic.RateLimitError)
    return Response.json({ error: "เรียกใช้ Claude ถี่เกินไป หรือเครดิตไม่พอ กรุณาลองใหม่ภายหลัง" }, { status: 429 });
  if (e instanceof Anthropic.APIError && e.status)
    return Response.json({ error: `Claude API error (${e.status}): ${e.message}` }, { status: 502 });
  if (e instanceof Anthropic.APIConnectionError)
    return Response.json({ error: "เชื่อมต่อ Claude API ไม่ได้ ตรวจสอบอินเทอร์เน็ตของ server" }, { status: 502 });
  return Response.json({ error: (e as Error).message }, { status: 500 });
}

/** Read the user's own key / model from request headers (sent from localStorage settings). */
export function userClaudeOptions(req: Request): { apiKey?: string; model?: string } {
  const apiKey = req.headers.get("x-user-anthropic-key")?.trim() || undefined;
  const model = req.headers.get("x-user-claude-model")?.trim() || undefined;
  return { apiKey, model };
}
