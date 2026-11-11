import path from "node:path";
import { SAMPLE_RATE } from "./audio.ts";
import type { Segment } from "./types.ts";

// transformers.js types are heavy; keep the surface we use small.
type Transcriber = (
  audio: Float32Array,
  options: Record<string, unknown>,
) => Promise<{ text: string; chunks?: { timestamp: [number, number | null]; text: string }[] }>;

const g = globalThis as unknown as { __whisper?: Map<string, Promise<Transcriber>> };
const cache = (g.__whisper ??= new Map());

/** Load (and cache in memory) a Whisper model. The first call downloads it from Hugging Face. */
export function getTranscriber(model: string, onStatus?: (msg: string) => void): Promise<Transcriber> {
  let p = cache.get(model);
  if (!p) {
    p = (async () => {
      const { pipeline, env } = await import("@huggingface/transformers");
      env.cacheDir = process.env.MODEL_CACHE_DIR || path.join(process.cwd(), ".cache", "models");
      let lastPct = -10;
      const pipe = await pipeline("automatic-speech-recognition", model, {
        progress_callback: (d: { status: string; file?: string; progress?: number }) => {
          if (d.status === "progress" && d.progress !== undefined && d.progress - lastPct >= 10) {
            lastPct = d.progress;
            onStatus?.(`กำลังดาวน์โหลดโมเดล ${model} (${d.file}) ${d.progress.toFixed(0)}%`);
          }
        },
      });
      return pipe as unknown as Transcriber;
    })();
    p = p.catch((e: Error) => {
      cache.delete(model);
      if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|403/.test(e.message)) {
        throw new Error(
          `ดาวน์โหลดโมเดล ${model} จาก huggingface.co ไม่สำเร็จ (${e.message}) — ตรวจสอบการเชื่อมต่ออินเทอร์เน็ตของ server`,
        );
      }
      throw e;
    });
    cache.set(model, p);
  }
  return p;
}

const WINDOW_SECONDS = 5 * 60; // process audio in 5-minute windows to report progress

export interface TranscribeOptions {
  model: string;
  language?: string; // "th", "en", ... or undefined for auto-detect
  onStatus?: (msg: string) => void;
  onProgress?: (percent: number, newSegments: Segment[]) => void;
  signal?: AbortSignal;
}

export async function transcribeSamples(samples: Float32Array, opts: TranscribeOptions): Promise<Segment[]> {
  opts.onStatus?.(`กำลังโหลดโมเดล ${opts.model} ...`);
  const transcriber = await getTranscriber(opts.model, opts.onStatus);
  opts.onStatus?.("กำลังถอดเสียง ...");

  const duration = samples.length / SAMPLE_RATE;
  const windowSize = WINDOW_SECONDS * SAMPLE_RATE;
  const segments: Segment[] = [];

  for (let offset = 0; offset < samples.length; offset += windowSize) {
    if (opts.signal?.aborted) throw new Error("ยกเลิกการถอดเสียงแล้ว");
    const slice = samples.subarray(offset, Math.min(offset + windowSize, samples.length));
    const offsetSec = offset / SAMPLE_RATE;
    const sliceEnd = offsetSec + slice.length / SAMPLE_RATE;

    const out = await transcriber(slice, {
      language: opts.language,
      task: "transcribe",
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: true,
    });

    const fresh: Segment[] = [];
    const chunks = out.chunks?.length ? out.chunks : [{ timestamp: [0, null] as [number, null], text: out.text }];
    for (const c of chunks) {
      const text = c.text.trim();
      if (!text) continue;
      const start = offsetSec + (c.timestamp[0] ?? 0);
      const end = Math.min(sliceEnd, offsetSec + (c.timestamp[1] ?? slice.length / SAMPLE_RATE));
      const prev = fresh.at(-1) ?? segments.at(-1);
      if (prev && prev.text === text) continue; // drop Whisper's repeated-line hallucinations
      fresh.push({ start, end: Math.max(end, start), text });
    }
    segments.push(...fresh);
    opts.onProgress?.(Math.min(100, (sliceEnd / duration) * 100), fresh);
  }
  return segments;
}
