import { spawn } from "node:child_process";

export const SAMPLE_RATE = 16_000;

/**
 * Decode any video/audio file to 16 kHz mono Float32 PCM (what Whisper expects) using ffmpeg.
 * Requires the `ffmpeg` binary on PATH (or FFMPEG_PATH).
 */
export function decodeAudio(inputPath: string): Promise<Float32Array> {
  const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
  return new Promise((resolve, reject) => {
    const proc = spawn(/*turbopackIgnore: true*/ ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-nostdin",
      "-i", inputPath,
      "-vn", "-ac", "1", "-ar", String(SAMPLE_RATE),
      "-f", "f32le", "pipe:1",
    ]);
    const chunks: Buffer[] = [];
    let stderr = "";
    proc.stdout.on("data", (c: Buffer) => chunks.push(c));
    proc.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
    proc.on("error", (err: NodeJS.ErrnoException) =>
      reject(
        err.code === "ENOENT"
          ? new Error("ไม่พบ ffmpeg บนเครื่อง server กรุณาติดตั้ง ffmpeg ก่อน (เช่น `sudo apt install ffmpeg` หรือ `brew install ffmpeg`)")
          : err,
      ),
    );
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`แยกเสียงจากไฟล์ไม่สำเร็จ (ffmpeg): ${stderr.trim() || `exit ${code}`}`));
      const buf = Buffer.concat(chunks);
      // Copy into an aligned buffer so it can be viewed as Float32Array.
      const samples = new Float32Array(Math.floor(buf.length / 4));
      new Uint8Array(samples.buffer).set(buf.subarray(0, samples.length * 4));
      if (samples.length === 0) return reject(new Error("ไม่พบสัญญาณเสียงในไฟล์นี้"));
      resolve(samples);
    });
  });
}
