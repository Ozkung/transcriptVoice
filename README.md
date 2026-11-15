# TranscriptVoice

เว็บแอป **Next.js (Full stack)** สำหรับถอดเสียงวิดีโอการประชุมเป็นเอกสาร

อัปโหลดวิดีโอ → แยกเสียง (ffmpeg) → ถอดเสียงด้วย Whisper บน server → แก้ไขคำผิดบนหน้าเว็บ → (ไม่บังคับ) ให้ **AI ของผู้ใช้เอง** สรุปรายงานการประชุม → ดาวน์โหลดเป็น **Word (.docx) / Markdown / TXT / SRT / WebVTT**

- **ไม่ใช้ Database** — ไฟล์วิดีโอเก็บใน temp และถูกลบทันทีหลังแยกเสียงเสร็จ ผลลัพธ์ส่งกลับให้ผู้ใช้ดาวน์โหลดเป็นไฟล์
- ถอดเสียงบนเครื่อง server เอง (Whisper ผ่าน [transformers.js](https://huggingface.co/docs/transformers.js)) ไม่ต้องใช้ API key รองรับภาษาไทย อังกฤษ และอื่น ๆ
- **Bring your own AI** — ผู้ใช้เลือกได้เองว่าจะใช้ Claude, GPT, Gemini หรือ Ollama / API ที่รองรับรูปแบบ OpenAI แล้วใส่ API Key ของตัวเองในหน้าตั้งค่า (เก็บใน localStorage ของเบราว์เซอร์)
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

### ตั้งค่า AI สำหรับสรุปรายงานการประชุม (ไม่บังคับ)

ผู้ใช้แต่ละคนใช้ AI และ API Key ของตัวเอง ไม่ต้องตั้งค่าอะไรที่ server

1. กดปุ่ม **⚙ ตั้งค่า** มุมขวาบน
2. เลือกผู้ให้บริการ: Claude (Anthropic), GPT (OpenAI), Gemini (Google) หรือ Ollama / OpenAI-compatible
3. ใส่ API Key แล้วกด **ตรวจสอบ Key และโหลดรายชื่อโมเดล** (การดึงรายชื่อโมเดลไม่เสียค่าใช้จ่าย)
4. เลือกโมเดลแล้วกดบันทึก

| ผู้ให้บริการ | ขอ API Key ที่ |
|---|---|
| Claude | https://console.anthropic.com/settings/keys |
| GPT | https://platform.openai.com/api-keys |
| Gemini | https://aistudio.google.com/apikey |
| Ollama | ไม่ต้องใช้ Key — ใส่ Base URL เช่น `http://localhost:11434/v1` |

**ความปลอดภัยของ Key**
- Key ถูกเก็บใน localStorage ของเบราว์เซอร์นั้นเท่านั้น ไม่มีฐานข้อมูล และ server ไม่บันทึก Key
- ตอนสั่งสรุป เบราว์เซอร์ส่ง Key ไปให้ server ของแอปนี้ แล้ว server ส่งต่อไปยังผู้ให้บริการ AI — ควรเปิดใช้งานผ่าน HTTPS เมื่อนำขึ้น server จริง
- ใครที่ใช้คอมพิวเตอร์เครื่องเดียวกันเปิดเบราว์เซอร์นั้นได้ ก็เห็น Key ได้ กด **ลบการตั้งค่าทั้งหมด** เมื่อใช้เครื่องสาธารณะ
- ตัวเลือก Ollama / OpenAI-compatible ให้ server เรียก URL ที่ผู้ใช้กำหนด เหมาะกับการใช้งานภายในองค์กร ถ้าเปิดเป็นบริการสาธารณะควรจำกัด URL ที่อนุญาต

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
  components/SettingsDialog.tsx  หน้าตั้งค่า AI / API Key (localStorage)
  api/summarize/route.ts   สรุปรายงานการประชุมด้วย AI ที่ผู้ใช้เลือก
  api/ai/models/route.ts   ตรวจสอบ Key และดึงรายชื่อโมเดล
  api/export/route.ts      สร้างไฟล์ docx / md / txt / srt / vtt / json
lib/
  audio.ts      แยกเสียงเป็น PCM 16 kHz ด้วย ffmpeg
  whisper.ts    โหลดโมเดลและถอดเสียงเป็นช่วง ๆ (รายงานความคืบหน้า)
  ai.ts         เรียก Claude / GPT / Gemini / OpenAI-compatible ด้วย Key ของผู้ใช้
  settings.ts   การตั้งค่าฝั่งเบราว์เซอร์ (localStorage)
  summarize.ts  prompt สรุปรายงานการประชุม
  docx.ts       สร้างเอกสาร Word
  format.ts     แปลงเวลา, SRT, VTT, TXT, Markdown
  markdown.ts   ตัวแยก Markdown อย่างง่าย (ใช้ทั้งหน้าเว็บและ docx)
test/           unit tests (node --test)
```

## ตัวแปร environment

| ตัวแปร | ความหมาย |
|---|---|
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
