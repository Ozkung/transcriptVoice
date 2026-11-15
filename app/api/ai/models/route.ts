import { aiErrorResponse, listModels, parseAiConfig } from "@/lib/ai.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ai/models  body: { ai: { provider, apiKey, baseUrl? } }  ->  { models: string[] }
 * Used by Settings to check the key and to fill the model dropdown. Listing models costs no tokens.
 */
export async function POST(req: Request) {
  try {
    const { ai } = await req.json();
    const models = await listModels(parseAiConfig(ai));
    return Response.json({ models });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
