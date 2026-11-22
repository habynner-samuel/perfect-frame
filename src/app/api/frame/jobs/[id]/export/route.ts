import { callApi, errorResponse, forBrowser, type ApiJob } from "@/server/frame-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID = /^[a-f0-9-]{36}$/;
const MAX_FRAMES = 30;

/** Pede a exportacao de todas as fotos escolhidas num unico pedido. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID.test(id)) return Response.json({ error: "Tarefa inválida." }, { status: 400 });
  try {
    const body = (await req.json().catch(() => ({}))) as { timestamps?: unknown };
    const ts = body.timestamps;
    if (!Array.isArray(ts) || !ts.length || ts.length > MAX_FRAMES || !ts.every((t) => typeof t === "number" && Number.isFinite(t))) {
      return Response.json({ error: `Envie de 1 a ${MAX_FRAMES} instantes em segundos.` }, { status: 400 });
    }
    // confere contra a duracao real do video antes de ocupar a VM
    const job = await callApi<ApiJob>(`/jobs/${id}`);
    const duration = job.duration ?? 0;
    if (duration && ts.some((t: number) => t < 0 || t >= duration)) {
      return Response.json({ error: `Os instantes precisam estar entre 0 e ${duration.toFixed(1)} s.` }, { status: 400 });
    }
    const started = await callApi<ApiJob>(`/jobs/${id}/export`, { method: "POST", body: { timestamps: ts } });
    return Response.json(forBrowser(started), { status: 202 });
  } catch (e) {
    return errorResponse(e);
  }
}
