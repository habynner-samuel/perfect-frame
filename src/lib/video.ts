// Leitura de frames de um arquivo de video local, sem enviar nada para fora.

/** Contadores simples de desempenho (inspecionaveis em window.__fdpPerf). */
export const perf = { seek: 0, bitmap: 0, grabs: 0, analyze: 0, analyzes: 0, w: { draw: 0, detect: 0, measure: 0, embed: 0 } };
if (typeof window !== "undefined") (window as unknown as { __fdpPerf: typeof perf }).__fdpPerf = perf;

export class VideoSource {
  readonly video: HTMLVideoElement;
  readonly url: string;

  private constructor(video: HTMLVideoElement, url: string) {
    this.video = video;
    this.url = url;
  }

  static async open(file: File, video: HTMLVideoElement): Promise<VideoSource> {
    const url = URL.createObjectURL(file);
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      const ok = () => { cleanup(); resolve(); };
      const fail = () => { cleanup(); reject(new Error("formato")); };
      const cleanup = () => {
        video.removeEventListener("loadeddata", ok);
        video.removeEventListener("error", fail);
      };
      video.addEventListener("loadeddata", ok);
      video.addEventListener("error", fail);
    });
    if (!video.videoWidth || !video.videoHeight) throw new Error("formato");
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error("duracao");
    return new VideoSource(video, url);
  }

  get duration() { return this.video.duration; }
  get width() { return this.video.videoWidth; }
  get height() { return this.video.videoHeight; }

  /** Vai ate o tempo t e espera o frame estar pronto. */
  async seek(t: number): Promise<void> {
    const v = this.video;
    const target = Math.max(0, Math.min(t, v.duration - 0.05));
    if (Math.abs(v.currentTime - target) < 1e-4 && v.readyState >= 2) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { cleanup(); reject(new Error("seek")); }, 15000);
      const done = () => { cleanup(); resolve(); };
      const cleanup = () => {
        clearTimeout(timer);
        v.removeEventListener("seeked", done);
      };
      v.addEventListener("seeked", done);
      v.currentTime = target;
    });
  }

  /** Frame atual em resolucao cheia. */
  async grab(t: number): Promise<ImageBitmap> {
    const t0 = performance.now();
    await this.seek(t);
    const t1 = performance.now();
    const bmp = await createImageBitmap(this.video);
    perf.seek += t1 - t0;
    perf.bitmap += performance.now() - t1;
    perf.grabs++;
    return bmp;
  }

  /** Frame em tamanho cheio desenhado num canvas. */
  async canvasAt(t: number): Promise<HTMLCanvasElement> {
    await this.seek(t);
    const c = document.createElement("canvas");
    c.width = this.width;
    c.height = this.height;
    c.getContext("2d")!.drawImage(this.video, 0, 0);
    return c;
  }

  /** Estima o fps tocando o video por um instante (sem som). */
  async estimateFps(): Promise<number> {
    const v = this.video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
    };
    if (!v.requestVideoFrameCallback) return 30;
    const start = v.currentTime;
    const times: number[] = [];
    try {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 1200);
        const cb = (_: number, meta: { mediaTime: number }) => {
          times.push(meta.mediaTime);
          if (times.length >= 12) { clearTimeout(timer); resolve(); return; }
          v.requestVideoFrameCallback!(cb);
        };
        v.requestVideoFrameCallback!(cb);
        v.play().catch(() => { clearTimeout(timer); resolve(); });
      });
    } finally {
      v.pause();
    }
    await this.seek(start).catch(() => {});
    const deltas: number[] = [];
    for (let i = 1; i < times.length; i++) {
      const d = times[i] - times[i - 1];
      if (d > 0.005 && d < 0.2) deltas.push(d);
    }
    if (deltas.length < 3) return 30;
    deltas.sort((a, b) => a - b);
    const fps = 1 / deltas[deltas.length >> 1];
    return Math.max(10, Math.min(120, fps));
  }

  dispose() {
    this.video.removeAttribute("src");
    this.video.load();
    URL.revokeObjectURL(this.url);
  }
}

export function fileKey(file: File) {
  return `${file.name}|${file.size}|${file.lastModified}`;
}
