/** User settings kept only in this browser's localStorage (no database, nothing stored on the server). */

import { DEFAULT_WHISPER_MODEL } from "./types.ts";

export const CLAUDE_MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5 (แม่นยำที่สุด)" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (สมดุล ราคาถูกลง)" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 (เร็ว ประหยัดที่สุด)" },
] as const;

export const DEFAULT_CLAUDE_MODEL = "claude-opus-5-5";

export interface Settings {
  anthropicApiKey: string;
  claudeModel: string;
  language: string;
  whisperModel: string;
  autoSummary: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  anthropicApiKey: "",
  claudeModel: DEFAULT_CLAUDE_MODEL,
  language: "th",
  whisperModel: DEFAULT_WHISPER_MODEL,
  autoSummary: false,
};

const STORAGE_KEY = "transcriptvoice.settings.v1";

export function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS }; // private mode / blocked storage / corrupt JSON
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

/** "sk-ant-api03-abcd...wxyz" -> "sk-ant-…wxyz" for display. */
export function maskKey(key: string): string {
  if (!key) return "";
  return key.length <= 12 ? "••••" : `${key.slice(0, 7)}…${key.slice(-4)}`;
}

/** Header the browser uses to send the user's own key to our API routes. */
export const API_KEY_HEADER = "x-user-anthropic-key";
export const MODEL_HEADER = "x-user-claude-model";
