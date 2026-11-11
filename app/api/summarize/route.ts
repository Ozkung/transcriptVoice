import Anthropic from "@anthropic-ai/sdk";
import { MissingApiKeyError, summarizeTranscript } from "@/lib/summarize.ts";
import type { Transcript } from "@/lib/types.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

/** POST /api/summarize  body: { transcript }  ->  { summary } (Markdown) */
export async function POST(req: Request) {
  let transcript: Transcript;
  try {
    ({ transcript } = await req.json());
    if (!transcript?.segments?.length) throw new Error();
  } catch {
    return Response.json({ error: "ข้อมูลบทถอดเสียงไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const summary = await summarizeTranscript(transcript);
    return Response.json({ summary });
  } catch (e) {
    if (e instanceof MissingApiKeyError) return Response.json({ error: e.message }, { status: 400 });
    if (e instanceof Anthropic.AuthenticationError)
      return Response.json({ error: "ANTHROPIC_API_KEY ไม่ถูกต้อง" }, { status: 401 });
    if (e instanceof Anthropic.RateLimitError)
      return Response.json({ error: "เรียกใช้ Claude ถี่เกินไป กรุณาลองใหม่อีกครั้ง" }, { status: 429 });
    if (e instanceof Anthropic.APIError)
      return Response.json({ error: `Claude API error: ${e.message}` }, { status: 502 });
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
