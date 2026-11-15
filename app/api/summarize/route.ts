import { summarizeTranscript } from "@/lib/summarize.ts";
import type { Transcript } from "@/lib/types.ts";
import { claudeErrorResponse, userClaudeOptions } from "../claude-errors.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

/**
 * POST /api/summarize  body: { transcript }  ->  { summary } (Markdown)
 * Optional headers x-user-anthropic-key / x-user-claude-model come from the user's Settings
 * (localStorage). The key is used for this one request only - never stored or logged.
 */
export async function POST(req: Request) {
  let transcript: Transcript;
  try {
    ({ transcript } = await req.json());
    if (!transcript?.segments?.length) throw new Error();
  } catch {
    return Response.json({ error: "ข้อมูลบทถอดเสียงไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const summary = await summarizeTranscript(transcript, userClaudeOptions(req));
    return Response.json({ summary });
  } catch (e) {
    return claudeErrorResponse(e);
  }
}
