import { importEnabled } from "@/server/frame-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Diz ao navegador se a importacao por link esta disponivel. */
export function GET() {
  return Response.json({ youtube: importEnabled() }, { headers: { "Cache-Control": "no-store" } });
}
