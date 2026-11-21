// Compila o Web Worker de analise (TypeScript) para public/analyzer.worker.js.
// O worker e "classico" (IIFE) para que o MediaPipe possa usar importScripts.
import { build } from "esbuild";

await build({
  entryPoints: ["src/worker/analyzer.worker.ts"],
  outfile: "public/analyzer.worker.js",
  bundle: true,
  format: "iife",
  target: "es2022",
  minify: process.env.NODE_ENV === "production",
  sourcemap: false,
  logLevel: "info",
});
