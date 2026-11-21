import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Isolamento de origem (COOP/COEP) libera multithread no WASM.
// Em producao, os mesmos cabecalhos ficam no vercel.json.
const isolation = [
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
];

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  reactStrictMode: true,
  ...(isDev
    ? { async headers() { return [{ source: "/:path*", headers: isolation }]; } }
    : {}),
};

export default nextConfig;
