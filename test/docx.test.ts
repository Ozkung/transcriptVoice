import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDocx } from "../lib/docx.ts";

test("buildDocx produces a valid .docx (zip) with Thai text", async () => {
  const buf = await buildDocx(
    {
      source: "meeting.mp4",
      language: "th",
      duration: 60,
      segments: [{ start: 1, end: 3, text: "ทดสอบภาษาไทย" }],
    },
    "บันทึกการประชุม",
    "## สรุปภาพรวม\n- ประเด็น **สำคัญ**\n\n| งาน | ผู้รับผิดชอบ |\n|---|---|\n| ทำรายงาน | สมชาย |",
  );
  assert.equal(buf.subarray(0, 2).toString(), "PK");
  assert.ok(buf.length > 3000);
});
