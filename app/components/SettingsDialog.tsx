"use client";

import { useEffect, useRef, useState } from "react";
import {
  AI_PROVIDERS,
  aiConfigFrom,
  clearSettings,
  DEFAULT_SETTINGS,
  saveSettings,
  type AiProvider,
  type Settings,
} from "@/lib/settings.ts";
import { WHISPER_MODELS } from "@/lib/types.ts";

interface Props {
  open: boolean;
  settings: Settings;
  onClose: () => void;
  onSave: (s: Settings) => void;
}

type Check = { state: "idle" | "checking" | "ok" | "error"; message?: string };

export default function SettingsDialog({ open, settings, onClose, onSave }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<Settings>(settings);
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [check, setCheck] = useState<Check>({ state: "idle" });
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setDraft(settings);
      setModels([]);
      setCheck({ state: "idle" });
      setNotice(null);
      setShowKey(false);
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open, settings]);

  const provider = AI_PROVIDERS.find((p) => p.id === draft.provider)!;
  const key = draft.apiKeys[draft.provider];
  const model = draft.models[draft.provider];

  const update = (patch: Partial<Settings>) => setDraft((d) => ({ ...d, ...patch }));
  const setKey = (v: string) => {
    update({ apiKeys: { ...draft.apiKeys, [draft.provider]: v } });
    setCheck({ state: "idle" });
  };
  const setModel = (v: string) => update({ models: { ...draft.models, [draft.provider]: v } });
  const setProvider = (p: AiProvider) => {
    update({ provider: p });
    setModels([]);
    setCheck({ state: "idle" });
    setShowKey(false);
  };

  async function verify() {
    setCheck({ state: "checking" });
    try {
      const res = await fetch("/api/ai/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ai: aiConfigFrom(draft) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "ตรวจสอบไม่สำเร็จ");
      const list: string[] = data.models ?? [];
      setModels(list);
      if (!model && list.length) setModel(list[0]);
      setCheck({ state: "ok", message: `ใช้งานได้ · พบ ${list.length} โมเดล` });
    } catch (e) {
      setCheck({ state: "error", message: (e as Error).message });
    }
  }

  function save() {
    const ok = saveSettings(draft);
    onSave(draft);
    if (!ok) setNotice("เบราว์เซอร์ไม่อนุญาตให้บันทึก (เช่นโหมดไม่ระบุตัวตน) — การตั้งค่าจะหายเมื่อปิดหน้าเว็บ");
    else onClose();
  }

  function reset() {
    if (!confirm("ลบ API Key และการตั้งค่าทั้งหมดออกจากเบราว์เซอร์นี้?")) return;
    clearSettings();
    const fresh = structuredClone(DEFAULT_SETTINGS);
    setDraft(fresh);
    onSave(fresh);
    setModels([]);
    setCheck({ state: "idle" });
  }

  const needsKey = draft.provider !== "openai-compatible";
  const modelOptions = models.length ? models : model ? [model] : [];

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onCancel={onClose}>
      <form method="dialog" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="dialog-head">
          <h2>ตั้งค่า</h2>
          <button type="button" className="icon-btn" aria-label="ปิด" onClick={onClose}>✕</button>
        </div>

        <h3>AI ของคุณ (ใช้สรุปรายงานการประชุม)</h3>
        <p className="small muted">
          ใช้ API Key ของคุณเอง ค่าใช้จ่ายเรียกเก็บจากบัญชีของคุณโดยตรง Key ถูกเก็บไว้ในเบราว์เซอร์นี้เท่านั้น (localStorage)
          และส่งไปที่ server เฉพาะตอนสั่งสรุป โดยไม่ถูกบันทึกไว้
        </p>

        <label className="field">
          ผู้ให้บริการ
          <select value={draft.provider} onChange={(e) => setProvider(e.target.value as AiProvider)}>
            {AI_PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>

        {draft.provider === "openai-compatible" && (
          <label className="field">
            Base URL
            <input type="text" value={draft.customBaseUrl} placeholder="http://localhost:11434/v1"
              onChange={(e) => { update({ customBaseUrl: e.target.value }); setCheck({ state: "idle" }); }} />
            <span className="hint">Ollama: http://localhost:11434/v1 (ต้องรันบนเครื่องเดียวกับ server หรือเครื่องที่ server เข้าถึงได้)</span>
          </label>
        )}

        <label className="field">
          API Key {needsKey ? "" : "(ไม่บังคับ)"}
          <div className="row nowrap">
            <input type={showKey ? "text" : "password"} value={key} placeholder={provider.keyHint}
              autoComplete="off" spellCheck={false} onChange={(e) => setKey(e.target.value)} />
            <button type="button" className="btn" onClick={() => setShowKey((v) => !v)}>
              {showKey ? "ซ่อน" : "แสดง"}
            </button>
          </div>
          {provider.keyUrl && (
            <span className="hint">
              ขอ Key ได้ที่ <a href={provider.keyUrl} target="_blank" rel="noreferrer">{new URL(provider.keyUrl).host}</a>
            </span>
          )}
        </label>

        <div className="row">
          <button type="button" className="btn" onClick={verify}
            disabled={check.state === "checking" || (needsKey ? !key.trim() : !draft.customBaseUrl.trim())}>
            {check.state === "checking" ? "กำลังตรวจสอบ ..." : "ตรวจสอบ Key และโหลดรายชื่อโมเดล"}
          </button>
          {check.state === "ok" && <span className="ok small">✓ {check.message}</span>}
        </div>
        {check.state === "error" && <div className="error small">{check.message}</div>}

        <label className="field">
          โมเดล
          {modelOptions.length ? (
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              {modelOptions.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : (
            <input type="text" value={model} placeholder="กดตรวจสอบ Key เพื่อเลือกจากรายการ หรือพิมพ์ชื่อโมเดล"
              onChange={(e) => setModel(e.target.value)} />
          )}
        </label>

        <label className="check">
          <input type="checkbox" checked={draft.autoSummary} onChange={(e) => update({ autoSummary: e.target.checked })} />
          สรุปรายงานการประชุมอัตโนมัติหลังถอดเสียงเสร็จ
        </label>

        <h3>ค่าเริ่มต้นการถอดเสียง</h3>
        <div className="options">
          <label className="field">
            ภาษา
            <select value={draft.language} onChange={(e) => update({ language: e.target.value })}>
              <option value="th">ไทย</option>
              <option value="en">อังกฤษ</option>
              <option value="auto">ตรวจจับอัตโนมัติ</option>
            </select>
          </label>
          <label className="field">
            โมเดล Whisper
            <select value={draft.whisperModel} onChange={(e) => update({ whisperModel: e.target.value })}>
              {WHISPER_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
        </div>

        {notice && <div className="error small">{notice}</div>}

        <div className="row dialog-foot">
          <button type="button" className="btn danger" onClick={reset}>ลบการตั้งค่าทั้งหมด</button>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>ยกเลิก</button>
          <button type="submit" className="btn primary">บันทึก</button>
        </div>
      </form>
    </dialog>
  );
}
