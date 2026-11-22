import type { NextConfig } from "next";

// Isolamento de origem (COOP/COEP) libera multithread no WASM do analisador.
// Os mesmos cabecalhos tambem estao no vercel.json.
const isolation = [
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
];

const nextConfig: NextConfig = {
  // Sem "output: export": as rotas /api/frame (importacao do YouTube) rodam
  // no servidor do Next.js, onde fica o token da Frame API.
  images: { unoptimized: true },
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: isolation }];
  },
};

export default nextConfig;
