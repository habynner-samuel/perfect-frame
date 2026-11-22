// Ponte do Next.js com a Frame API (scripts/frame-api.mjs). So roda no servidor:
// o token fica aqui e nunca vai para o navegador.

import { createHmac } from "node:crypto";

const BASE = process.env.FRAME_API_BASE_URL?.replace(/\/$/, "");
const PUBLIC = (process.env.FRAME_API_PUBLIC_URL || process.env.FRAME_API_BASE_URL)?.replace(/\/$/, "");
const TOKEN = process.env.FRAME_API_TOKEN;
/** validade das URLs de midia entregues ao navegador */
const SIGNED_URL_TTL = 10 * 60;

/**
 * A importacao por link so fica ligada fora de producao. O site e publico e
 * nao tem login: antes de liberar em producao e preciso ter controle de acesso
 * e de uso (quem pode importar, quantas vezes), senao qualquer um usaria a VM.
 */
export function importEnabled() {
  return Boolean(BASE && TOKEN && TOKEN.length >= 24 && process.env.NODE_ENV !== "production");
}

export interface ApiJob {
  id: string;
  videoId: string;
  state: "downloading" | "ready" | "exporting" | "complete" | "failed";
  error?: string;
  title?: string;
  duration?: number;
  preview?: { width: number; height: number };
  source?: { width: number; height: number };
  frames?: { index: number; time: number }[];
  expiresAt: string;
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export async function callApi<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  if (!importEnabled()) throw new ApiError(404, "Importação do YouTube desativada.");
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: init.method ?? "GET",
      headers: { Authorization: `Bearer ${TOKEN}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(503, "O servidor de importação não respondeu. Ele está ligado?");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error || "Falha no servidor de importação.");
  return data as T;
}

/** URL assinada (HMAC com o token) que o navegador usa para baixar direto da API. */
export function signedUrl(path: string) {
  const exp = Math.floor(Date.now() / 1000) + SIGNED_URL_TTL;
  const sig = createHmac("sha256", TOKEN!).update(`GET\n${path}\n${exp}`).digest("base64url");
  return `${PUBLIC}${path}?exp=${exp}&sig=${sig}`;
}

/** Status para o navegador: sem segredos, com URLs assinadas da midia pronta. */
export function forBrowser(job: ApiJob) {
  return {
    id: job.id,
    state: job.state,
    error: job.error,
    title: job.title,
    duration: job.duration,
    preview: job.preview,
    source: job.source,
    previewUrl: job.preview ? signedUrl(`/jobs/${job.id}/preview`) : undefined,
    frames:
      job.state === "complete"
        ? (job.frames ?? []).map((f) => ({ time: f.time, url: signedUrl(`/jobs/${job.id}/frames/${f.index}`) }))
        : undefined,
  };
}

export function errorResponse(e: unknown) {
  const status = e instanceof ApiError ? e.status : 500;
  const message = e instanceof ApiError ? e.message : "Erro inesperado na importação.";
  return Response.json({ error: message }, { status });
}
