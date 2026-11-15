import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { AiError, chat, listModels, parseAiConfig } from "../lib/ai.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

type Captured = { url: string; init: RequestInit };
function mockFetch(status: number, body: unknown): Captured[] {
  const calls: Captured[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return calls;
}

test("parseAiConfig validates provider, key and base URL", () => {
  assert.throws(() => parseAiConfig({ provider: "nope" }), AiError);
  assert.throws(() => parseAiConfig({ provider: "openai", apiKey: "  ", model: "x" }), /API Key/);
  assert.throws(() => parseAiConfig({ provider: "openai-compatible", baseUrl: "file:///etc" }), /Base URL/);
  const c = parseAiConfig({ provider: "openai-compatible", baseUrl: "http://localhost:11434/v1/", model: "llama" });
  assert.equal(c.baseUrl, "http://localhost:11434/v1");
  assert.equal(c.apiKey, "");
});

test("OpenAI: chat sends bearer key, system+user, returns content", async () => {
  const calls = mockFetch(200, { choices: [{ message: { content: "สรุป" }, finish_reason: "stop" }] });
  const out = await chat({ provider: "openai", apiKey: "sk-test", model: "gpt-x" }, { system: "S", user: "U" });
  assert.equal(out, "สรุป");
  assert.equal(calls[0].url, "https://api.openai.com/v1/chat/completions");
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, "Bearer sk-test");
  const body = JSON.parse(String(calls[0].init.body));
  assert.deepEqual(body.messages, [{ role: "system", content: "S" }, { role: "user", content: "U" }]);
  assert.equal(body.model, "gpt-x");
});

test("Ollama / OpenAI-compatible: custom base URL and no auth header without key", async () => {
  const calls = mockFetch(200, { choices: [{ message: { content: "ok" } }] });
  await chat({ provider: "openai-compatible", apiKey: "", model: "llama3", baseUrl: "http://localhost:11434/v1" }, { system: "S", user: "U" });
  assert.equal(calls[0].url, "http://localhost:11434/v1/chat/completions");
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, undefined);
});

test("Gemini: chat uses x-goog-api-key and systemInstruction", async () => {
  const calls = mockFetch(200, { candidates: [{ content: { parts: [{ text: "ก" }, { text: "ข" }] }, finishReason: "STOP" }] });
  const out = await chat({ provider: "gemini", apiKey: "AIza-test", model: "models/gemini-x" }, { system: "S", user: "U" });
  assert.equal(out, "กข");
  assert.equal(calls[0].url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent");
  assert.equal((calls[0].init.headers as Record<string, string>)["x-goog-api-key"], "AIza-test");
  const body = JSON.parse(String(calls[0].init.body));
  assert.equal(body.systemInstruction.parts[0].text, "S");
  assert.equal(body.contents[0].parts[0].text, "U");
});

test("listModels: Gemini keeps only generateContent models", async () => {
  mockFetch(200, {
    models: [
      { name: "models/gemini-a", supportedGenerationMethods: ["generateContent"] },
      { name: "models/embed-b", supportedGenerationMethods: ["embedContent"] },
    ],
  });
  assert.deepEqual(await listModels({ provider: "gemini", apiKey: "k", model: "" }), ["gemini-a"]);
});

test("HTTP errors become Thai messages without leaking the key", async () => {
  mockFetch(401, { error: { message: "Incorrect API key provided: sk-secret" } });
  await assert.rejects(
    chat({ provider: "openai", apiKey: "sk-secret", model: "m" }, { system: "S", user: "U" }),
    (e: AiError) => e.status === 401 && /API Key ไม่ถูกต้อง/.test(e.message) && !e.message.includes("sk-secret"),
  );
  mockFetch(429, { error: { message: "quota" } });
  await assert.rejects(
    chat({ provider: "gemini", apiKey: "k", model: "m" }, { system: "S", user: "U" }),
    (e: AiError) => e.status === 429,
  );
});
