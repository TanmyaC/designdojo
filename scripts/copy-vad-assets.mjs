// Copy the voice-activity-detection model and its WebAssembly runtime into public/vad/,
// so the browser loads them from this site instead of a CDN. Runs after npm install.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd(), out = path.join(root, "public", "vad");
const files = [
  ["node_modules/@ricky0123/vad-web/dist", ["vad.worklet.bundle.min.js", "silero_vad_v5.onnx"]],
  ["node_modules/onnxruntime-web/dist", ["ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"]],
];
fs.mkdirSync(out, { recursive: true });
let n = 0;
for (const [dir, names] of files) for (const f of names) {
  const src = path.join(root, dir, f);
  if (!fs.existsSync(src)) { console.warn(`[vad] missing ${path.join(dir, f)}; voice detection won't load`); continue; }
  fs.copyFileSync(src, path.join(out, f)); n++;
}
console.log(`[vad] copied ${n} files to public/vad/`);
