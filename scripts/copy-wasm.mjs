// Copia os runtimes WASM (MediaPipe e ONNX Runtime) para public/vendor,
// para que tudo seja servido do proprio site, sem CDN.
import { cpSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const out = join(root, "public", "vendor");
mkdirSync(join(out, "ort"), { recursive: true });
mkdirSync(join(out, "mediapipe"), { recursive: true });

const ortDist = join(root, "node_modules", "onnxruntime-web", "dist");
for (const f of [
  "ort.all.min.js",
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm-simd-threaded.jsep.wasm",
  "ort-wasm-simd-threaded.asyncify.mjs",
  "ort-wasm-simd-threaded.asyncify.wasm",
]) {
  const src = join(ortDist, f);
  if (existsSync(src)) cpSync(src, join(out, "ort", f));
}

cpSync(
  join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm"),
  join(out, "mediapipe"),
  { recursive: true }
);
console.log("WASM copiado para public/vendor");
