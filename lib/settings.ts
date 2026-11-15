/**
 * User settings - kept ONLY in this browser's localStorage.
 * No database; the server never stores the user's API keys (they are sent per request).
 */

import { DEFAULT_WHISPER_MODEL } from "./types.ts";

export const AI_PROVIDERS = [
  { id: "anthropic", label: "Claude (Anthropic)", keyHint: "sk-ant-...", keyUrl: "https://console.anthropic.com/settings/keys" },
  { id: "openai", label: "GPT (OpenAI)", keyHint: "sk-...", keyUrl: "https://platform.openai.com/api-keys" },
  { id: "gemini", label: "Gemini (Google)", keyHint: "AIza...", keyUrl: "https://aistudio.google.com/apikey" },
  {
    id: "openai-compatible",
    label: "Ollama / OpenAI-compatible (กำหนด URL เอง)",
    keyHint: "ไม่บังคับ (Ollama ไม่ต้องใช้ Key)",
    keyUrl: "",
  },
] as const;

export type AiProvider = (typeof AI_PROVIDERS)[number]["id"];

/** What the browser sends to the server for one AI call. */
export interface AiConfig {
  provider: AiProvider;
  apiKey: string;
  model: string;
  baseUrl?: string; // only for openai-compatible, e.g. http://localhost:11434/v1
}

export interface Settings {
  provider: AiProvider;
  apiKeys: Record<AiProvider, string>;
  models: Record<AiProvider, string>;
  customBaseUrl: string;
  language: string;
  whisperModel: string;
  autoSummary: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  provider: "anthropic",
  apiKeys: { anthropic: "", openai: "", gemini: "", "openai-compatible": "" },
  models: { anthropic: "claude-opus-5-5", openai: "", gemini: "", "openai-compatible": "" },
  customBaseUrl: "http://localhost:11434/v1",
  language: "th",
  whisperModel: DEFAULT_WHISPER_MODEL,
  autoSummary: false,
};

const STORAGE_KEY = "transcriptvoice.settings.v1";

export function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const p = JSON.parse(raw) as Partial<Settings>;
    return {
      ...DEFAULT_SETTINGS,
      ...p,
      apiKeys: { ...DEFAULT_SETTINGS.apiKeys, ...p.apiKeys },
      models: { ...DEFAULT_SETTINGS.models, ...p.models },
    };
  } catch {
    return structuredClone(DEFAULT_SETTINGS); // private mode / blocked storage / corrupt JSON
  }
}

/** Returns false when the browser refuses to store (e.g. private mode). */
export function saveSettings(s: Settings): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

export function clearSettings(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function aiConfigFrom(s: Settings): AiConfig {
  return {
    provider: s.provider,
    apiKey: s.apiKeys[s.provider].trim(),
    model: s.models[s.provider].trim(),
    baseUrl: s.provider === "openai-compatible" ? s.customBaseUrl.trim() : undefined,
  };
}

/** Is the selected provider ready to use (key + model filled in)? */
export function isAiReady(c: AiConfig): boolean {
  if (!c.model) return false;
  if (c.provider === "openai-compatible") return Boolean(c.baseUrl);
  return Boolean(c.apiKey);
}

export function providerLabel(id: AiProvider): string {
  return AI_PROVIDERS.find((p) => p.id === id)?.label ?? id;
}
