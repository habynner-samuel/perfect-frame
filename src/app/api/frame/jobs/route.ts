import { callApi, errorResponse, forBrowser, importEnabled, type ApiJob } from "@/server/frame-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cria a tarefa de importacao: a API baixa a versao leve (ate 360p). */
export async function POST(req: Request) {
  if (!importEnabled()) return Response.json({ error: "Importação do YouTube desativada." }, { status: 404 });
  try {
    const body = (await req.json().catch(() => ({}))) as { url?: unknown };
    if (typeof body.url !== "string" || body.url.length > 500) {
      return Response.json({ error: "Cole um link do YouTube." }, { status: 400 });
    }
    const job = await callApi<ApiJob>("/jobs", { method: "POST", body: { url: body.url } });
    return Response.json(forBrowser(job), { status: 202 });
  } catch (e) {
    return errorResponse(e);
  }
}
