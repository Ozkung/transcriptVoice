import { aiErrorResponse, parseAiConfig } from "@/lib/ai.ts";
import { summarizeTranscript } from "@/lib/summarize.ts";
import type { Transcript } from "@/lib/types.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

/**
 * POST /api/summarize  body: { transcript, ai: { provider, apiKey, model, baseUrl? } }  ->  { summary }
 * `ai` comes from the user's own Settings (localStorage). The key is used for this call only -
 * never stored or logged.
 */
export async function POST(req: Request) {
  let body: { transcript?: Transcript; ai?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 400 });
  }
  if (!body.transcript?.segments?.length) return Response.json({ error: "ข้อมูลบทถอดเสียงไม่ถูกต้อง" }, { status: 400 });

  try {
    const summary = await summarizeTranscript(body.transcript, parseAiConfig(body.ai));
    return Response.json({ summary });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
