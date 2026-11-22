// Ponte entre a interface e o Web Worker de analise.
import { perf } from "./video";
import type { Box, EngineInfo, FrameResult, Posture, WorkerRequest, WorkerResponse } from "./types";

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

export class AnalyzerClient {
  private worker: Worker;
  private seq = 0;
  private pending = new Map<number, Pending>();
  onProgress?: (message: string) => void;

  constructor() {
    this.worker = new Worker("/analyzer.worker.js");
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.type === "progress") {
        this.onProgress?.(msg.message);
        return;
      }
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.type === "error") p.reject(new Error(msg.message));
      else if (msg.type === "ready") p.resolve(msg.info);
      else if (msg.type === "result") p.resolve(msg.result);
      else if (msg.type === "pose") p.resolve(msg.posture);
    };
    this.worker.onerror = (e) => {
      const err = new Error(e.message || "Erro no processamento");
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
    };
  }

  private call<T>(req: Omit<WorkerRequest, "id"> & { type: WorkerRequest["type"] }, transfer: Transferable[] = []): Promise<T> {
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker.postMessage({ ...req, id }, transfer);
    });
  }

  init(): Promise<EngineInfo> {
    return this.call<EngineInfo>({ type: "init" });
  }

  async analyze(t: number, bitmap: ImageBitmap, opts: { mode?: "scan" | "full"; roi?: Box } = {}): Promise<FrameResult> {
    const t0 = performance.now();
    const r = await this.call<FrameResult>({ type: "analyze", t, bitmap, ...opts } as WorkerRequest, [bitmap]);
    perf.analyze += performance.now() - t0;
    perf.analyzes++;
    if (r.ms) for (const k of Object.keys(r.ms) as (keyof NonNullable<FrameResult["ms"]>)[]) perf.w[k] += r.ms[k];
    return r;
  }

  /** Postura do corpo da pessoa cujo rosto esta em `face` (pixels do frame). */
  pose(bitmap: ImageBitmap, face: Box): Promise<Posture> {
    return this.call<Posture>({ type: "pose", bitmap, face } as WorkerRequest, [bitmap]);
  }

  /** Ajuste fino da deteccao em blocos (diagnostico). */
  config(tiling: { frac?: number; maxY?: number; overlap?: number }, delegate?: "GPU" | "CPU", thresholds?: { det: number; pres: number }) {
    return this.call<EngineInfo>({ type: "config", tiling, delegate, thresholds } as WorkerRequest);
  }

  terminate() {
    this.worker.terminate();
  }
}

let shared: AnalyzerClient | null = null;
let ready: Promise<EngineInfo> | null = null;

/** Um unico worker por aba, iniciado sob demanda. */
export function getAnalyzer(onProgress?: (m: string) => void) {
  if (!shared) shared = new AnalyzerClient();
  shared.onProgress = onProgress;
  if (!ready) {
    ready = shared.init().then((i) => {
      (window as unknown as { __fdpEngine: EngineInfo }).__fdpEngine = i;
      (window as unknown as { __fdpClient: AnalyzerClient }).__fdpClient = shared!;
      return i;
    }).catch((e) => {
      ready = null;
      throw e;
    });
  }
  return { client: shared, ready };
}
