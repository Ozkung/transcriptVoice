"use client";

import { useEffect, useRef, useState } from "react";
import Markdown from "./components/Markdown";
import { formatTimestamp } from "@/lib/format.ts";
import {
  DEFAULT_WHISPER_MODEL,
  WHISPER_MODELS,
  type ExportFormat,
  type Segment,
  type TranscribeEvent,
  type Transcript,
} from "@/lib/types.ts";

const LANGUAGES = [
  { id: "th", label: "ไทย" },
  { id: "en", label: "อังกฤษ" },
  { id: "auto", label: "ตรวจจับอัตโนมัติ" },
];

const DOWNLOADS: { format: ExportFormat; label: string }[] = [
  { format: "docx", label: "Word (.docx)" },
  { format: "md", label: "Markdown" },
  { format: "txt", label: "ข้อความ (.txt)" },
  { format: "srt", label: "ซับไตเติล (.srt)" },
  { format: "vtt", label: "WebVTT" },
];

type Phase = "idle" | "transcribing" | "done";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [language, setLanguage] = useState("th");
  const [model, setModel] = useState<string>(DEFAULT_WHISPER_MODEL);
  const [autoSummary, setAutoSummary] = useState(false);
  const [drag, setDrag] = useState(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState("");
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [segments, setSegments] = useState<Segment[]>([]);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const [tab, setTab] = useState<"transcript" | "summary">("transcript");
  const [currentTime, setCurrentTime] = useState(0);
  const [downloading, setDownloading] = useState<ExportFormat | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<HTMLVideoElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => { if (mediaUrl) URL.revokeObjectURL(mediaUrl); }, [mediaUrl]);

  function pickFile(f: File | undefined) {
    if (!f) return;
    setFile(f);
    setMediaUrl(URL.createObjectURL(f));
    setTitle(`บันทึกการประชุม: ${f.name.replace(/\.[^.]+$/, "")}`);
    setTranscript(null);
    setSegments([]);
    setSummary("");
    setError(null);
    setPhase("idle");
  }

  async function start() {
    if (!file) return;
    setPhase("transcribing");
    setError(null);
    setSegments([]);
    setSummary("");
    setTranscript(null);
    setPercent(0);
    setStatus("กำลังอัปโหลดไฟล์ ...");
    setTab("transcript");

    const ac = new AbortController();
    abortRef.current = ac;
    const qs = new URLSearchParams({ filename: file.name, language, model });
    let finalTranscript: Transcript | null = null;
    let received = 0;
    try {
      const res = await fetch(`/api/transcribe?${qs}`, { method: "POST", body: file, signal: ac.signal });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `เกิดข้อผิดพลาด (${res.status})`);
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as TranscribeEvent;
          if (ev.type === "status") setStatus(ev.message);
          else if (ev.type === "progress") setPercent(ev.percent);
          else if (ev.type === "segments") {
            received += ev.segments.length;
            setSegments((s) => [...s, ...ev.segments]);
          }
          else if (ev.type === "error") throw new Error(ev.message);
          else if (ev.type === "done") finalTranscript = ev.transcript;
        }
      }
      if (!finalTranscript) throw new Error("การเชื่อมต่อขาดก่อนถอดเสียงเสร็จ");
      const t: Transcript = finalTranscript;
      setTranscript(t);
      setSegments(t.segments);
      setPhase("done");
      setStatus("");
      if (autoSummary) void summarize(t);
    } catch (e) {
      if ((e as Error).name === "AbortError") setError("ยกเลิกแล้ว");
      else setError((e as Error).message);
      setPhase("idle");
      if (received) setStatus("");
    } finally {
      abortRef.current = null;
    }
  }

  function currentTranscript(): Transcript | null {
    return transcript ? { ...transcript, segments } : null;
  }

  async function summarize(t = currentTranscript()) {
    if (!t) return;
    setSummarizing(true);
    setTab("summary");
    setError(null);
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: t }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "สรุปไม่สำเร็จ");
      setSummary(data.summary);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSummarizing(false);
    }
  }

  async function download(format: ExportFormat) {
    const t = currentTranscript();
    if (!t) return;
    setDownloading(format);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: t, format, title, summary: summary || undefined }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "สร้างไฟล์ไม่สำเร็จ");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${t.source.replace(/\.[^.]+$/, "")}.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDownloading(null);
    }
  }

  function seek(t: number) {
    if (mediaRef.current) {
      mediaRef.current.currentTime = t;
      void mediaRef.current.play();
    }
  }

  function editSegment(i: number, text: string) {
    setSegments((s) => s.map((seg, j) => (j === i ? { ...seg, text: text.trim() } : seg)));
  }

  const busy = phase === "transcribing";
  const isAudio = file?.type.startsWith("audio/");

  return (
    <main className="container">
      <header className="top">
        <h1>TranscriptVoice</h1>
        <p>อัปโหลดวิดีโอการประชุม → ถอดเสียงเป็นข้อความ → ดาวน์โหลดเป็นเอกสาร Word / Markdown / ซับไตเติล</p>
      </header>

      <section className="card">
        <div
          className={`dropzone${drag ? " drag" : ""}`}
          onClick={() => !busy && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); if (!busy) pickFile(e.dataTransfer.files[0]); }}
        >
          <strong>{file ? file.name : "ลากไฟล์วิดีโอมาวาง หรือคลิกเพื่อเลือกไฟล์"}</strong>
          <span>
            {file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : "รองรับ MP4, MOV, MKV, WEBM, MP3, M4A, WAV"}
          </span>
          <input
            ref={inputRef}
            type="file"
            accept="video/*,audio/*"
            hidden
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
        </div>

        <div className="options">
          <label className="field">
            ภาษาในการประชุม
            <select value={language} onChange={(e) => setLanguage(e.target.value)} disabled={busy}>
              {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </label>
          <label className="field">
            โมเดลถอดเสียง (Whisper)
            <select value={model} onChange={(e) => setModel(e.target.value)} disabled={busy}>
              {WHISPER_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={autoSummary} onChange={(e) => setAutoSummary(e.target.checked)} disabled={busy} />
            สรุปรายงานการประชุมด้วย AI อัตโนมัติ
          </label>
        </div>

        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn primary" onClick={start} disabled={!file || busy}>
            {busy ? "กำลังถอดเสียง ..." : "เริ่มถอดเสียง"}
          </button>
          {busy && <button className="btn" onClick={() => abortRef.current?.abort()}>ยกเลิก</button>}
          <span className="spacer" />
          {busy && <span className="status">{status}</span>}
        </div>
        {busy && (
          <div className="progress" aria-label="ความคืบหน้า">
            <div style={{ width: `${percent}%` }} />
          </div>
        )}
      </section>

      {error && <div className="error" role="alert">{error}</div>}

      {(segments.length > 0 || transcript) && (
        <section className="result">
          <div className="sticky">
            {mediaUrl && (
              <div className="card">
                {isAudio ? (
                  <audio ref={mediaRef as unknown as React.RefObject<HTMLAudioElement>} src={mediaUrl} controls
                    onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)} />
                ) : (
                  <video ref={mediaRef} src={mediaUrl} controls
                    onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)} />
                )}
              </div>
            )}
            <div className="card">
              <label className="field">
                หัวเรื่องเอกสาร
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <p className="small muted" style={{ margin: "12px 0 8px" }}>ดาวน์โหลดเอกสาร</p>
              <div className="row">
                {DOWNLOADS.map((d) => (
                  <button key={d.format} className="btn" onClick={() => download(d.format)}
                    disabled={!transcript || downloading !== null}>
                    {downloading === d.format ? "กำลังสร้าง ..." : d.label}
                  </button>
                ))}
              </div>
              <p className="small muted" style={{ marginBottom: 0 }}>
                ไม่มีการเก็บข้อมูลบน server — ไฟล์วิดีโอถูกลบทันทีหลังแยกเสียงเสร็จ
              </p>
            </div>
          </div>

          <div className="card">
            <div className="tabs">
              <button className={tab === "transcript" ? "active" : ""} onClick={() => setTab("transcript")}>
                บทถอดเสียง ({segments.length})
              </button>
              <button className={tab === "summary" ? "active" : ""} onClick={() => setTab("summary")}>
                สรุปรายงานการประชุม
              </button>
            </div>

            {tab === "transcript" ? (
              <>
                <p className="small muted" style={{ marginTop: 0 }}>
                  คลิกเวลาเพื่อเล่นวิดีโอจากจุดนั้น · คลิกข้อความเพื่อแก้ไขคำที่ถอดผิดก่อนดาวน์โหลด
                </p>
                <div className="segments">
                  {segments.map((s, i) => {
                    const active = currentTime >= s.start && currentTime < s.end;
                    return (
                      <div key={`${i}-${s.start}`} className={`seg${active ? " active" : ""}`}>
                        <time onClick={() => seek(s.start)}>{formatTimestamp(s.start, { ms: false })}</time>
                        <span
                          className="text"
                          contentEditable={phase === "done"}
                          suppressContentEditableWarning
                          onBlur={(e) => editSegment(i, e.currentTarget.textContent ?? "")}
                        >
                          {s.text}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : summarizing ? (
              <p className="status">กำลังสรุปรายงานการประชุมด้วย Claude ... (อาจใช้เวลา 1–2 นาที)</p>
            ) : summary ? (
              <>
                <Markdown source={summary} />
                <div className="row" style={{ marginTop: 12 }}>
                  <button className="btn" onClick={() => summarize()}>สรุปใหม่</button>
                </div>
              </>
            ) : (
              <div>
                <p className="muted">
                  ให้ AI สรุปบทถอดเสียงเป็นรายงานการประชุม: ภาพรวม ประเด็นที่หารือ มติ งานที่ต้องทำ และผู้รับผิดชอบ
                  (ต้องตั้งค่า ANTHROPIC_API_KEY บน server)
                </p>
                <button className="btn primary" onClick={() => summarize()} disabled={!transcript}>
                  สรุปรายงานการประชุม
                </button>
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
