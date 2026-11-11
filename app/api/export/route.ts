import { buildDocx } from "@/lib/docx.ts";
import { safeBaseName, toJson, toMarkdown, toSrt, toTxt, toVtt } from "@/lib/format.ts";
import { EXPORT_FORMATS, type ExportFormat, type Transcript } from "@/lib/types.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME: Record<ExportFormat, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  md: "text/markdown; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  srt: "application/x-subrip; charset=utf-8",
  vtt: "text/vtt; charset=utf-8",
  json: "application/json; charset=utf-8",
};

/** POST /api/export  body: { transcript, format, title?, summary? }  ->  file download */
export async function POST(req: Request) {
  let body: { transcript: Transcript; format: ExportFormat; title?: string; summary?: string };
  try {
    body = await req.json();
    if (!body.transcript?.segments || !EXPORT_FORMATS.includes(body.format)) throw new Error();
  } catch {
    return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 400 });
  }
  const { transcript, format, summary } = body;
  const title = body.title?.trim() || `บันทึกการประชุม: ${safeBaseName(transcript.source)}`;

  let content: string | Buffer;
  switch (format) {
    case "docx":
      content = await buildDocx(transcript, title, summary);
      break;
    case "md":
      content = toMarkdown(transcript, title, summary);
      break;
    case "srt":
      content = toSrt(transcript);
      break;
    case "vtt":
      content = toVtt(transcript);
      break;
    case "json":
      content = toJson(transcript, summary);
      break;
    default:
      content = toTxt(transcript);
  }

  const filename = `${safeBaseName(transcript.source)}.${format}`;
  return new Response(new Uint8Array(typeof content === "string" ? Buffer.from(content, "utf-8") : content), {
    headers: {
      "Content-Type": MIME[format],
      "Content-Disposition": `attachment; filename="transcript.${format}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
