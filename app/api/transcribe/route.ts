import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { decodeAudio, SAMPLE_RATE } from "@/lib/audio.ts";
import { DEFAULT_WHISPER_MODEL, WHISPER_MODELS, type TranscribeEvent, type Transcript } from "@/lib/types.ts";
import { transcribeSamples } from "@/lib/whisper.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 3600;

/**
 * POST /api/transcribe?filename=..&language=th&model=Xenova/whisper-small
 * Body: the raw video/audio file (streamed straight to a temp file - no database, nothing kept).
 * Response: NDJSON stream of TranscribeEvent.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const filename = url.searchParams.get("filename") || "video";
  const lang = url.searchParams.get("language") || "th";
  const language = lang === "auto" ? undefined : lang;
  const modelParam = url.searchParams.get("model") || DEFAULT_WHISPER_MODEL;
  const model = WHISPER_MODELS.some((m) => m.id === modelParam) ? modelParam : DEFAULT_WHISPER_MODEL;

  if (!req.body) return Response.json({ error: "ไม่พบไฟล์ที่อัปโหลด" }, { status: 400 });

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "transcriptvoice-"));
  const inputPath = path.join(tmpDir, "input" + (path.extname(filename) || ".bin"));
  try {
    await pipeline(Readable.fromWeb(req.body as unknown as NodeReadableStream), createWriteStream(inputPath));
  } catch (e) {
    await rm(tmpDir, { recursive: true, force: true });
    return Response.json({ error: `อัปโหลดไม่สำเร็จ: ${(e as Error).message}` }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (ev: TranscribeEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
        } catch {
          /* client disconnected */
        }
      };
      try {
        send({ type: "status", message: "กำลังแยกเสียงจากวิดีโอ (ffmpeg) ..." });
        const samples = await decodeAudio(inputPath);
        await rm(tmpDir, { recursive: true, force: true }); // ลบไฟล์ต้นฉบับทันทีที่แปลงเสร็จ

        const segments = await transcribeSamples(samples, {
          model,
          language,
          signal: req.signal,
          onStatus: (message) => send({ type: "status", message }),
          onProgress: (percent, fresh) => {
            if (fresh.length) send({ type: "segments", segments: fresh });
            send({ type: "progress", percent });
          },
        });
        const transcript: Transcript = {
          source: filename,
          language: language ?? "auto",
          duration: samples.length / SAMPLE_RATE,
          segments,
        };
        send({ type: "done", transcript });
      } catch (e) {
        send({ type: "error", message: (e as Error).message });
      } finally {
        await rm(tmpDir, { recursive: true, force: true });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
