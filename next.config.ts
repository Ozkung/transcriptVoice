import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // โมเดล Whisper (onnxruntime-node) เป็น native module ต้องไม่ถูก bundle
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node", "sharp"],
};

export default nextConfig;
