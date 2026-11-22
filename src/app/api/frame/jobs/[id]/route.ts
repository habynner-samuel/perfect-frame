import { callApi, errorResponse, forBrowser, type ApiJob } from "@/server/frame-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID = /^[a-f0-9-]{36}$/;

/** Status da tarefa, com URLs assinadas da previa e das fotos quando prontas. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID.test(id)) return Response.json({ error: "Tarefa inválida." }, { status: 400 });
  try {
    const job = await callApi<ApiJob>(`/jobs/${id}`);
    return Response.json(forBrowser(job), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
