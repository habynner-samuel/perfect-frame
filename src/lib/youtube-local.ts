// Conversa com o ajudante local do YouTube (scripts/youtube-local.mjs).
// So existe quando o site roda no seu computador com "npm run dev".

const HELPER = "http://127.0.0.1:3001";

export type Quality = "low" | "high";

export interface YtJob {
  id: string;
  state: "downloading" | "done" | "error";
  loaded: number;
  total: number;
  title: string;
  error?: string;
}

/** O ajudante esta rodando? (so no localhost) */
export async function helperAvailable(): Promise<boolean> {
  if (typeof window === "undefined" || !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return false;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1200);
    const res = await fetch(`${HELPER}/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "O ajudante do YouTube não respondeu.");
  return body as T;
}

/** Pede o download e espera terminar, avisando o progresso. */
export async function downloadVersion(
  link: string,
  quality: Quality,
  onProgress: (job: YtJob) => void,
  signal?: AbortSignal
): Promise<YtJob> {
  let job = await json<YtJob>(await fetch(`${HELPER}/start?quality=${quality}&url=${encodeURIComponent(link)}`, { signal }));
  onProgress(job);
  while (job.state === "downloading") {
    await new Promise((r) => setTimeout(r, 500));
    if (signal?.aborted) throw new DOMException("cancelado", "AbortError");
    job = await json<YtJob>(await fetch(`${HELPER}/status?quality=${quality}&id=${job.id}`, { signal }));
    onProgress(job);
  }
  if (job.state === "error") throw new Error(job.error || "Não deu para baixar esse vídeo.");
  return job;
}

/** Arquivo baixado, como File, para o mesmo caminho dos arquivos locais. */
export async function fetchVersion(id: string, quality: Quality, title: string): Promise<File> {
  const res = await fetch(`${HELPER}/file?quality=${quality}&id=${id}`);
  if (!res.ok) throw new Error("O arquivo baixado sumiu. Tente de novo.");
  const blob = await res.blob();
  // nome fixo por video e qualidade: assim a analise salva e reaproveitada
  return new File([blob], `youtube-${id}-${quality}.mp4`, { type: "video/mp4", lastModified: 0 });
}
