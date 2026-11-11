export interface Segment {
  start: number; // seconds
  end: number; // seconds
  text: string;
}

export interface Transcript {
  source: string;
  language: string;
  duration: number; // seconds
  segments: Segment[];
}

export const EXPORT_FORMATS = ["docx", "md", "txt", "srt", "vtt", "json"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const WHISPER_MODELS = [
  { id: "Xenova/whisper-base", label: "Base (เร็ว, ความแม่นยำพอใช้)" },
  { id: "Xenova/whisper-small", label: "Small (แนะนำ)" },
  { id: "Xenova/whisper-medium", label: "Medium (แม่นยำขึ้น, ช้า)" },
  { id: "onnx-community/whisper-large-v3-turbo", label: "Large v3 Turbo (แม่นยำที่สุด, ใช้ RAM มาก)" },
] as const;

export const DEFAULT_WHISPER_MODEL = "Xenova/whisper-small";

/** Events streamed (NDJSON) from POST /api/transcribe */
export type TranscribeEvent =
  | { type: "status"; message: string }
  | { type: "progress"; percent: number }
  | { type: "segments"; segments: Segment[] }
  | { type: "done"; transcript: Transcript }
  | { type: "error"; message: string };
