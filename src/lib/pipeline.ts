// Etapas do processo: varredura do video, miniaturas, selecao e exportacao.
import type { AnalyzerClient } from "./analyzer-client";
import { cosine } from "./geometry";
import { baseScore, crop45, expressionScore, personStats } from "./scoring";
import { saveScan } from "./storage";
import type { FaceRecord, FrameResult, Person, Pick, ScanData } from "./types";
import type { VideoSource } from "./video";

export interface ScanProgress {
  done: number;
  total: number;
  videoSeconds: number;
  etaSeconds: number | null;
  facesFound: number;
}

const SAVE_EVERY_VIDEO_SECONDS = 30;

/** Percorre o video pegando um frame a cada intervalo. */
export async function runScan(
  src: VideoSource,
  analyzer: AnalyzerClient,
  data: ScanData,
  onProgress: (p: ScanProgress) => void,
  signal: AbortSignal,
  preview?: HTMLCanvasElement | null
): Promise<ScanData> {
  const pctx = preview?.getContext("2d") ?? null;
  const total = data.totalFrames;
  const startIndex = data.nextIndex;
  const started = performance.now();
  let lastSavedT = startIndex * data.interval;
  let faces = data.frames.reduce((s, f) => s + f.faces.length, 0);

  let inFlight: Promise<FrameResult> | null = null;
  const collect = async () => {
    if (!inFlight) return;
    const r = await inFlight;
    inFlight = null;
    data.frames.push(r);
    faces += r.faces.length;
    data.nextIndex = data.frames.length;
    const t = r.t;
    const processed = data.nextIndex - startIndex;
    const elapsed = (performance.now() - started) / 1000;
    const rate = processed > 0 ? elapsed / processed : 0;
    onProgress({
      done: data.nextIndex,
      total,
      videoSeconds: Math.min(src.duration, t + data.interval),
      etaSeconds: processed >= 3 ? rate * (total - data.nextIndex) : null,
      facesFound: faces,
    });
    if (t - lastSavedT >= SAVE_EVERY_VIDEO_SECONDS) {
      lastSavedT = t;
      await saveScan(data);
    }
  };

  for (let i = startIndex; i < total; i++) {
    if (signal.aborted) break;
    const t = i * data.interval;
    // busca o proximo frame enquanto o worker processa o anterior
    const bitmap = await src.grab(t);
    // previa ao vivo: desenha o proprio frame que vai ser analisado
    if (pctx && preview) pctx.drawImage(bitmap, 0, 0, preview.width, preview.height);
    await collect();
    if (signal.aborted) { bitmap.close(); break; }
    inFlight = analyzer.analyze(t, bitmap);
  }
  await collect();

  data.done = data.nextIndex >= total;
  await saveScan(data);
  return data;
}

/** Miniatura quadrada do melhor rosto de cada pessoa. */
export async function makeThumbs(src: VideoSource, people: Person[]): Promise<void> {
  const c = document.createElement("canvas");
  c.width = c.height = 320;
  const ctx = c.getContext("2d")!;
  for (const p of people) {
    const f = p.bestFace;
    await src.seek(f.t);
    // quadrado em volta do rosto, sempre dentro do quadro (o Chrome desenha
    // errado quando o recorte de um video passa da borda)
    const side = Math.min(Math.max(f.box.w, f.box.h) * 1.7, src.width, src.height);
    const cx = f.box.x + f.box.w / 2, cy = f.box.y + f.box.h / 2 - f.box.h * 0.05;
    const sx = Math.max(0, Math.min(src.width - side, cx - side / 2));
    const sy = Math.max(0, Math.min(src.height - side, cy - side / 2));
    ctx.drawImage(src.video, sx, sy, side, side, 0, 0, 320, 320);
    p.thumb = c.toDataURL("image/jpeg", 0.85);
  }
}

export interface SelectProgress {
  done: number;
  total: number;
}

/** Escolhe e refina os melhores frames da pessoa. */
export async function selectBest(
  src: VideoSource,
  analyzer: AnalyzerClient,
  scan: ScanData,
  person: Person,
  count: number,
  minGap: number,
  fps: number,
  onProgress: (p: SelectProgress) => void,
  signal: AbortSignal,
  /** tempos de fotos ja mostradas, para "buscar novamente" trazer outras */
  exclude: number[] = []
): Promise<Pick[]> {
  const stats = personStats(person.faces);
  const framesByT = new Map<number, FrameResult>();
  for (const f of scan.frames) framesByT.set(f.t, f);

  const othersOf = (face: FaceRecord, frame: FrameResult | undefined) =>
    (frame?.faces ?? []).filter((o) => o !== face && !(o.box.x === face.box.x && o.box.y === face.box.y));

  // fora: perto de fotos ja mostradas, perfil, rosto minusculo ou cortado na borda
  const H0 = scan.height || src.height, W0 = scan.width || src.width;
  const usable = (f: FaceRecord) =>
    exclude.every((t) => Math.abs(t - f.t) >= minGap) &&
    Math.abs(f.yaw) <= 35 &&
    f.box.h / H0 >= 0.035 &&
    f.box.x > W0 * 0.01 && f.box.x + f.box.w < W0 * 0.99 && f.box.y > H0 * 0.01;
  let pool = person.faces.filter(usable);
  if (pool.length < count) pool = person.faces.filter((f) => exclude.every((t) => Math.abs(t - f.t) >= minGap));

  // 1. nota base e candidatos (4x a quantidade, com distancia minima): sobra
  //    folga para descartar quem estiver torto ou com a mao no rosto
  const ranked = pool
    .map((f) => ({ f, s: baseScore(f, othersOf(f, framesByT.get(f.t)), stats) }))
    .sort((a, b) => b.s - a.s);
  const candidates: typeof ranked = [];
  for (const r of ranked) {
    if (candidates.length >= count * 4) break;
    if (candidates.every((c) => Math.abs(c.f.t - r.f.t) >= minGap)) candidates.push(r);
  }

  // 2. refinamento nos frames vizinhos (meio segundo antes e depois, frame sim frame nao)
  const step = 2 / fps;
  const k = Math.max(1, Math.floor(0.5 / step));
  const refined: Pick[] = [];
  let done = 0;
  onProgress({ done, total: candidates.length });

  for (const cand of candidates) {
    if (signal.aborted) throw new DOMException("cancelado", "AbortError");
    let bestFrame = framesByT.get(cand.f.t);
    // regiao em volta do rosto: o rosto quase nao se move em meio segundo
    const fb = cand.f.box;
    const side = Math.max(fb.w, fb.h) * 5;
    const roi = { x: fb.x + fb.w / 2 - side / 2, y: fb.y + fb.h / 2 - side / 2, w: side, h: side };
    const options: { face: FaceRecord; frame: FrameResult | undefined }[] = [{ face: cand.f, frame: bestFrame }];
    for (let j = -k; j <= k; j++) {
      if (j === 0) continue;
      const t = cand.f.t + j * step;
      if (t < 0 || t > src.duration - 0.05) continue;
      const frame = await analyzer.analyze(t, await src.grab(t), { roi });
      let match: FaceRecord | null = null, sim = 0.4;
      for (const face of frame.faces) {
        const s = cosine(person.centroid, face.embedding);
        if (s >= sim) { sim = s; match = face; }
      }
      if (match) options.push({ face: match, frame });
    }
    // fica com o vizinho que junta nitidez e boa expressao (olhos abertos,
    // boca fechada), e nao so o mais nitido
    const maxSharp = Math.max(...options.map((o) => o.face.sharpness), 1e-6);
    const pickScore = (o: (typeof options)[number]) => 0.55 * (o.face.sharpness / maxSharp) + 0.45 * expressionScore(o.face.expression);
    const chosen = options.reduce((a, b) => (pickScore(b) > pickScore(a) ? b : a));
    const best = chosen.face;
    bestFrame = chosen.frame;

    // postura do corpo no frame escolhido
    let posture: Pick["posture"];
    try {
      posture = await analyzer.pose(await src.grab(best.t), best.box);
    } catch {
      posture = undefined;
    }

    // outros rostos: vem da varredura (o refinamento so olha em volta do rosto)
    const b = baseScore(best, othersOf(cand.f, framesByT.get(cand.f.t)), stats);
    const e = expressionScore(best.expression);
    const p = posture?.score ?? 0.5;
    const W = bestFrame?.width ?? src.width, H = bestFrame?.height ?? src.height;
    let final = 0.4 * b + 0.3 * e + 0.3 * p;
    // foto que nao serve para arte de igreja: muito torta, curvada ou com a mao no rosto
    if (posture?.found && (posture.score < 0.35 || posture.handOverFace)) final *= 0.6;
    refined.push({
      t: best.t,
      face: best,
      baseScore: b,
      expressionScore: e,
      postureScore: p,
      posture,
      finalScore: final,
      crop: crop45(best.box, W, H),
      frameWidth: W,
      frameHeight: H,
    });
    done++;
    onProgress({ done, total: candidates.length });
  }

  // 3. melhores na quantidade pedida, mantendo a distancia minima
  refined.sort((a, b) => b.finalScore - a.finalScore);
  const picks: Pick[] = [];
  for (const r of refined) {
    if (picks.length >= count) break;
    if (picks.every((p) => Math.abs(p.t - r.t) >= minGap)) picks.push(r);
  }
  return picks;
}

/** Pre-visualizacao leve (JPEG) de cada foto escolhida. */
export async function makePreviews(src: VideoSource, picks: Pick[]) {
  for (const p of picks) {
    await src.seek(p.t);
    const w = 960, h = Math.round((src.height / src.width) * w);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    c.getContext("2d")!.drawImage(src.video, 0, 0, w, h);
    p.preview = c.toDataURL("image/jpeg", 0.86);
  }
}

function toPng(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("png"))), "image/png")
  );
}

export async function fullPng(src: VideoSource, p: Pick): Promise<Blob> {
  return toPng(await src.canvasAt(p.t));
}

export async function cropPng(src: VideoSource, p: Pick): Promise<Blob> {
  await src.seek(p.t);
  const c = document.createElement("canvas");
  c.width = p.crop.w;
  c.height = p.crop.h;
  c.getContext("2d")!.drawImage(src.video, p.crop.x, p.crop.y, p.crop.w, p.crop.h, 0, 0, p.crop.w, p.crop.h);
  return toPng(c);
}

export function timeLabel(t: number) {
  const s = Math.floor(t);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = String(m).padStart(2, "0"), ss = String(sec).padStart(2, "0");
  return h ? `${h}h${mm}m${ss}s` : `${mm}m${ss}s`;
}

export function clockLabel(t: number) {
  const s = Math.floor(t);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
