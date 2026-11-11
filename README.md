# TranscriptVoice

เว็บแอป **Next.js (Full stack)** สำหรับถอดเสียงวิดีโอการประชุมเป็นเอกสาร

อัปโหลดวิดีโอ → แยกเสียง (ffmpeg) → ถอดเสียงด้วย Whisper บน server → แก้ไขคำผิดบนหน้าเว็บ → (ไม่บังคับ) ให้ Claude สรุปรายงานการประชุม → ดาวน์โหลดเป็น **Word (.docx) / Markdown / TXT / SRT / WebVTT**

- **ไม่ใช้ Database** — ไฟล์วิดีโอเก็บใน temp และถูกลบทันทีหลังแยกเสียงเสร็จ ผลลัพธ์ส่งกลับให้ผู้ใช้ดาวน์โหลดเป็นไฟล์
- ถอดเสียงบนเครื่อง server เอง (Whisper ผ่าน [transformers.js](https://huggingface.co/docs/transformers.js)) ไม่ต้องใช้ API key รองรับภาษาไทย อังกฤษ และอื่น ๆ
- แสดงผลแบบ real-time ระหว่างถอดเสียง คลิกเวลาเพื่อเล่นวิดีโอจากจุดนั้นได้
- เอกสาร Word ใช้ฟอนต์ TH Sarabun New พร้อมหัวข้อ ตารางข้อมูล สรุป และบทถอดเสียงฉบับเต็มพร้อมเวลา

## สิ่งที่ต้องมี

- Node.js 20.9 ขึ้นไป
- ffmpeg
  - macOS: `brew install ffmpeg`
  - Ubuntu/Debian: `sudo apt install ffmpeg`
  - Windows: `winget install ffmpeg`
- อินเทอร์เน็ตตอนใช้งานครั้งแรก (ดาวน์โหลดโมเดล Whisper จาก huggingface.co แล้วเก็บไว้ที่ `.cache/models`)

## ติดตั้งและรัน

```bash
npm install
```

```bash
npm run dev
```

เปิด http://localhost:3000

รันแบบ production:

```bash
npm run build && npm start
```

### เปิดใช้การสรุปรายงานการประชุม (ไม่บังคับ)

คัดลอก `.env.example` เป็น `.env.local` แล้วใส่ `ANTHROPIC_API_KEY` (ขอได้ที่ https://console.anthropic.com)

## เลือกโมเดลถอดเสียง

| โมเดล | ความเร็ว | ความแม่นยำภาษาไทย | หมายเหตุ |
|---|---|---|---|
| Base | เร็วมาก | พอใช้ | ใช้ทดสอบ |
| Small | ปานกลาง | ดี | ค่าเริ่มต้น |
| Medium | ช้า | ดีมาก | ใช้ RAM ~3 GB |
| Large v3 Turbo | ช้า | ดีที่สุด | ใช้ RAM มาก |

การถอดเสียงใช้ CPU บน server — วิดีโอ 1 ชั่วโมงอาจใช้เวลาหลายนาทีถึงหลายสิบนาทีขึ้นกับโมเดลและเครื่อง

## โครงสร้างโปรเจค

```
app/
  page.tsx                 หน้าเว็บ: อัปโหลด, ความคืบหน้า, แก้ไขข้อความ, ดาวน์โหลด
  components/Markdown.tsx  แสดงผลสรุปการประชุม
  api/transcribe/route.ts  รับไฟล์ → ffmpeg → Whisper → ส่งผลแบบ stream (NDJSON)
  api/summarize/route.ts   สรุปรายงานการประชุมด้วย Claude
  api/export/route.ts      สร้างไฟล์ docx / md / txt / srt / vtt / json
lib/
  audio.ts      แยกเสียงเป็น PCM 16 kHz ด้วย ffmpeg
  whisper.ts    โหลดโมเดลและถอดเสียงเป็นช่วง ๆ (รายงานความคืบหน้า)
  summarize.ts  prompt และการเรียก Claude API
  docx.ts       สร้างเอกสาร Word
  format.ts     แปลงเวลา, SRT, VTT, TXT, Markdown
  markdown.ts   ตัวแยก Markdown อย่างง่าย (ใช้ทั้งหน้าเว็บและ docx)
test/           unit tests (node --test)
```

## ตัวแปร environment

| ตัวแปร | ความหมาย |
|---|---|
| `ANTHROPIC_API_KEY` | ใช้สำหรับปุ่มสรุปรายงานการประชุม |
| `CLAUDE_MODEL` | โมเดล Claude ที่ใช้สรุป (ค่าเริ่มต้น `claude-opus-5-5`) |
| `MODEL_CACHE_DIR` | โฟลเดอร์เก็บโมเดล Whisper (ค่าเริ่มต้น `./.cache/models`) |
| `FFMPEG_PATH` | path ของ ffmpeg ถ้าไม่ได้อยู่ใน PATH |

## ทดสอบ

```bash
npm test
```

```bash
npm run typecheck
```

## ข้อจำกัด

- ยังไม่แยกผู้พูด (speaker diarization)
- ถอดเสียงบน server ต้องใช้ Node runtime ที่รันได้นาน ๆ (เครื่องตัวเอง, VPS, Docker) — ไม่เหมาะกับ serverless ที่จำกัดเวลา/RAM เช่น Vercel free tier
