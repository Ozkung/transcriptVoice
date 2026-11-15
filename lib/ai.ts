/**
 * Bring-your-own-AI: call the provider the user picked in Settings, with the user's own key.
 * Keys arrive in the request body, are used for that one call, and are never stored or logged.
 */

import Anthropic from "@anthropic-ai/sdk";
import { AI_PROVIDERS, type AiConfig } from "./settings.ts";

export class AiError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface ChatRequest {
  system: string;
  user: string;
}

const OPENAI_URL = "https://api.openai.com/v1";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta";

/** Validate and normalise the config coming from the browser. */
export function parseAiConfig(raw: unknown): AiConfig {
  const c = (raw ?? {}) as Partial<AiConfig>;
  if (!AI_PROVIDERS.some((p) => p.id === c.provider)) throw new AiError("ยังไม่ได้เลือกผู้ให้บริการ AI ในหน้าตั้งค่า");
  const cfg: AiConfig = {
    provider: c.provider!,
    apiKey: String(c.apiKey ?? "").trim(),
    model: String(c.model ?? "").trim(),
    baseUrl: c.baseUrl ? String(c.baseUrl).trim().replace(/\/+$/, "") : undefined,
  };
  if (cfg.provider === "openai-compatible") {
    if (!cfg.baseUrl || !/^https?:\/\//i.test(cfg.baseUrl))
      throw new AiError("กรุณาใส่ Base URL ที่ขึ้นต้นด้วย http:// หรือ https:// (เช่น http://localhost:11434/v1)");
  } else if (!cfg.apiKey) {
    throw new AiError("ยังไม่ได้ใส่ API Key — กดปุ่ม ⚙ ตั้งค่า ที่มุมขวาบน");
  }
  return cfg;
}

// ---------- error helpers ----------

function httpError(provider: string, status: number, detail: string): AiError {
  const name = AI_PROVIDERS.find((p) => p.id === provider)?.label ?? provider;
  if (status === 401 || status === 403)
    return new AiError(`${name}: API Key ไม่ถูกต้อง หรือไม่มีสิทธิ์ใช้โมเดลนี้`, 401);
  if (status === 404) return new AiError(`${name}: ไม่พบโมเดลนี้ — เลือกโมเดลใหม่ในหน้าตั้งค่า`, 404);
  if (status === 429) return new AiError(`${name}: เรียกใช้ถี่เกินไป หรือเครดิต/โควตาไม่พอ`, 429);
  return new AiError(`${name} error (${status}): ${detail.slice(0, 300)}`, 502);
}

async function fetchJson(provider: string, url: string, init: RequestInit): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(10 * 60_000) });
  } catch (e) {
    throw new AiError(`เชื่อมต่อ ${new URL(url).host} ไม่ได้ (${(e as Error).message})`, 502);
  }
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      const j = JSON.parse(text);
      detail = j.error?.message ?? j.error ?? text;
    } catch {
      /* keep raw text */
    }
    throw httpError(provider, res.status, String(detail));
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new AiError(`คำตอบจาก ${new URL(url).host} ไม่ใช่ JSON`, 502);
  }
}

function anthropicError(e: unknown): AiError {
  if (e instanceof Anthropic.APIConnectionError) return new AiError(`เชื่อมต่อ Claude API ไม่ได้ (${e.message})`, 502);
  if (e instanceof Anthropic.APIError && e.status) return httpError("anthropic", e.status, e.message);
  return e instanceof AiError ? e : new AiError((e as Error).message, 500);
}

// ---------- list models (also used to verify the key; costs no tokens) ----------

export async function listModels(cfg: AiConfig): Promise<string[]> {
  switch (cfg.provider) {
    case "anthropic": {
      try {
        const client = new Anthropic({ apiKey: cfg.apiKey });
        const ids: string[] = [];
        for await (const m of client.models.list({ limit: 100 })) ids.push(m.id);
        return ids;
      } catch (e) {
        throw anthropicError(e);
      }
    }
    case "gemini": {
      const data = await fetchJson("gemini", `${GEMINI_URL}/models?pageSize=1000`, {
        headers: { "x-goog-api-key": cfg.apiKey },
      });
      return ((data.models ?? []) as { name: string; supportedGenerationMethods?: string[] }[])
        .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m) => m.name.replace(/^models\//, ""));
    }
    default: {
      const base = cfg.provider === "openai" ? OPENAI_URL : cfg.baseUrl!;
      const data = await fetchJson(cfg.provider, `${base}/models`, { headers: authHeader(cfg) });
      return ((data.data ?? []) as { id: string }[]).map((m) => m.id).sort();
    }
  }
}

function authHeader(cfg: AiConfig): Record<string, string> {
  return cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {};
}

// ---------- chat ----------

export async function chat(cfg: AiConfig, req: ChatRequest): Promise<string> {
  if (!cfg.model) throw new AiError("ยังไม่ได้เลือกโมเดล AI ในหน้าตั้งค่า");
  switch (cfg.provider) {
    case "anthropic":
      return chatAnthropic(cfg, req);
    case "gemini":
      return chatGemini(cfg, req);
    default:
      return chatOpenAi(cfg, req);
  }
}

// Server-side refusal fallback ("default" routing) is offered on these Claude models.
const CLAUDE_FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5"]);

async function chatAnthropic(cfg: AiConfig, req: ChatRequest): Promise<string> {
  try {
    const client = new Anthropic({ apiKey: cfg.apiKey });
    const stream = client.beta.messages.stream({
      model: cfg.model,
      max_tokens: 32000,
      system: req.system,
      ...(CLAUDE_FALLBACK_MODELS.has(cfg.model)
        ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
        : {}),
      messages: [{ role: "user", content: req.user }],
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") throw new AiError("Claude ปฏิเสธการสรุปเนื้อหานี้", 422);
    const text = message.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    return message.stop_reason === "max_tokens" ? `${text}\n\n_(ผลลัพธ์ถูกตัดเนื่องจากยาวเกินขีดจำกัด)_` : text;
  } catch (e) {
    throw anthropicError(e);
  }
}

async function chatOpenAi(cfg: AiConfig, req: ChatRequest): Promise<string> {
  const base = cfg.provider === "openai" ? OPENAI_URL : cfg.baseUrl!;
  const data = await fetchJson(cfg.provider, `${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader(cfg) },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
    }),
  });
  const choice = data.choices?.[0];
  const text = String(choice?.message?.content ?? "").trim();
  if (!text) throw new AiError("AI ไม่ได้ส่งข้อความกลับมา", 502);
  return choice.finish_reason === "length" ? `${text}\n\n_(ผลลัพธ์ถูกตัดเนื่องจากยาวเกินขีดจำกัด)_` : text;
}

async function chatGemini(cfg: AiConfig, req: ChatRequest): Promise<string> {
  const model = cfg.model.replace(/^models\//, "");
  const data = await fetchJson("gemini", `${GEMINI_URL}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: "user", parts: [{ text: req.user }] }],
    }),
  });
  const cand = data.candidates?.[0];
  const text = ((cand?.content?.parts ?? []) as { text?: string }[]).map((p) => p.text ?? "").join("").trim();
  if (!text) {
    const reason = cand?.finishReason ?? data.promptFeedback?.blockReason ?? "ไม่ทราบสาเหตุ";
    throw new AiError(`Gemini ไม่ได้ส่งข้อความกลับมา (${reason})`, 502);
  }
  return cand.finishReason === "MAX_TOKENS" ? `${text}\n\n_(ผลลัพธ์ถูกตัดเนื่องจากยาวเกินขีดจำกัด)_` : text;
}

/** Turn any thrown error into a JSON response. Never includes the API key. */
export function aiErrorResponse(e: unknown): Response {
  const err = e instanceof AiError ? e : new AiError((e as Error).message, 500);
  return Response.json({ error: err.message }, { status: err.status });
}
