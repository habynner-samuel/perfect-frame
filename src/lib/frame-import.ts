// Importacao do YouTube pelo navegador. Fala so com as rotas /api/frame do
// Next.js; a previa e as fotos chegam direto da Frame API por URLs assinadas.

export interface ImportJob {
  id: string;
  state: "downloading" | "ready" | "exporting" | "complete" | "failed";
  error?: string;
  title?: string;
  duration?: number;
  preview?: { width: number; height: number };
  source?: { width: number; height: number };
  previewUrl?: string;
  frames?: { time: number; url: string }[];
}

async function asJson<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || "A importação falhou. Tente de novo ou use o upload.");
  return body as T;
}

/** A importacao por link esta ligada neste ambiente? */
export async function importAvailable(): Promise<boolean> {
  try {
    const res = await fetch("/api/frame/config", { cache: "no-store" });
    if (!res.ok) return false;
    return Boolean((await res.json()).youtube);
  } catch {
    return false;
  }
}

async function waitFor(id: string, done: (j: ImportJob) => boolean, onStatus: (j: ImportJob) => void, signal?: AbortSignal) {
  for (;;) {
    if (signal?.aborted) throw new DOMException("cancelado", "AbortError");
    const job = await asJson<ImportJob>(await fetch(`/api/frame/jobs/${id}`, { cache: "no-store", signal }));
    onStatus(job);
    if (job.state === "failed") throw new Error(job.error || "A importação falhou.");
    if (done(job)) return job;
    await new Promise((r) => setTimeout(r, 1500));
  }
}

/** Cria a tarefa e espera a versao leve ficar pronta. */
export async function importPreview(link: string, onStatus: (j: ImportJob) => void, signal?: AbortSignal) {
  const job = await asJson<ImportJob>(
    await fetch("/api/frame/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: link }),
      signal,
    })
  );
  onStatus(job);
  return waitFor(job.id, (j) => Boolean(j.previewUrl) && j.state !== "downloading", onStatus, signal);
}

/** Baixa a previa (direto da API) como File para o fluxo normal de analise. */
export async function fetchPreview(job: ImportJob, videoId: string): Promise<File> {
  const res = await fetch(job.previewUrl!, { mode: "cors" });
  if (!res.ok) throw new Error("Não deu para receber a prévia. Tente de novo.");
  const blob = await res.blob();
  // nome fixo por video: a analise salva no navegador e reaproveitada
  return new File([blob], `youtube-${videoId}.mp4`, { type: "video/mp4", lastModified: 0 });
}

/**
 * Pede todas as fotos de uma vez (a API baixa a versao alta uma vez so e
 * extrai os PNGs com FFmpeg) e devolve cada foto como canvas, por instante.
 */
export async function exportFrames(
  id: string,
  timestamps: number[],
  onStatus: (j: ImportJob) => void
): Promise<{ frames: Map<number, HTMLCanvasElement>; source?: { width: number; height: number } }> {
  await asJson<ImportJob>(
    await fetch(`/api/frame/jobs/${id}/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timestamps }),
    })
  );
  const job = await waitFor(id, (j) => j.state === "complete", onStatus);
  const frames = new Map<number, HTMLCanvasElement>();
  for (const f of job.frames ?? []) {
    const res = await fetch(f.url, { mode: "cors" });
    if (!res.ok) throw new Error("Não deu para receber uma das fotos. Tente de novo.");
    const bmp = await createImageBitmap(await res.blob());
    const c = document.createElement("canvas");
    c.width = bmp.width;
    c.height = bmp.height;
    c.getContext("2d")!.drawImage(bmp, 0, 0);
    bmp.close();
    frames.set(f.time, c);
  }
  return { frames, source: job.source };
}

/** Extrai o id do video do link (para nomear o arquivo da previa). */
export function videoIdOf(link: string): string | null {
  try {
    const u = new URL(link.trim());
    const host = u.hostname.replace(/^(www|m|music)\./, "");
    const parts = u.pathname.split("/").filter(Boolean);
    const id = host === "youtu.be" ? parts[0] : u.pathname === "/watch" ? u.searchParams.get("v") : ["live", "shorts", "embed", "v"].includes(parts[0]) ? parts[1] : null;
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
