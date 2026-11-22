/// <reference lib="webworker" />
// Web Worker de analise: detecta rostos (MediaPipe FaceLandmarker), mede
// nitidez, luz e pose, e gera a impressao digital de cada rosto (SFace).
// Roda fora da thread principal para a interface nao travar.

import { FaceLandmarker, FilesetResolver, PoseLandmarker, type FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import type * as OrtTypes from "onnxruntime-web";
import { ARCFACE_TEMPLATE, similarityTransform, normalize, clamp01, type Pt } from "../lib/geometry";
import type { Box, Expression, FaceRecord, FrameResult, Posture, WorkerRequest, WorkerResponse, EngineInfo } from "../lib/types";

declare const self: DedicatedWorkerGlobalScope;
declare const ort: typeof OrtTypes;

const MODEL_CACHE = "frame-do-pregador-modelos-v1";
const LANDMARKER_URL = "/models/face_landmarker.task";
const SFACE_URL = "/models/face_recognition_sface_2021dec.onnx";
const POSE_URL = "/models/pose_landmarker_lite.task";
const DETECT_WIDTH = 960;
const SHARP_WIDTH = 160;

let landmarker: FaceLandmarker | null = null;
let sface: OrtTypes.InferenceSession | null = null;
let sfaceInput = "data";
let info: EngineInfo | null = null;
let makeLandmarker: ((d: "GPU" | "CPU") => Promise<FaceLandmarker>) | null = null;
let fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>> | null = null;
let poser: Promise<PoseLandmarker> | null = null;

const post = (msg: WorkerResponse) => self.postMessage(msg);

/** Desiste de uma etapa que travou (ex.: driver de GPU que nao responde). */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("tempo esgotado")), ms);
    p.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });
}

/** Baixa o modelo uma vez e guarda no Cache Storage do navegador. */
async function loadModel(url: string): Promise<ArrayBuffer> {
  try {
    const cache = await caches.open(MODEL_CACHE);
    const hit = await cache.match(url);
    if (hit) return await hit.arrayBuffer();
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await cache.put(url, res.clone());
    return await res.arrayBuffer();
  } catch {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Falha ao baixar ${url}`);
    return await res.arrayBuffer();
  }
}

/**
 * Varias threads deixam o SFace ~3x mais rapido, mas em alguns ambientes a
 * inicializacao com threads trava. Testamos num worker descartavel primeiro.
 */
async function probeThreads(): Promise<number> {
  // worker extra da varredura em paralelo: recebe um teto de threads no nome
  const cap = Number(/threads=(\d+)/.exec(self.name)?.[1] ?? 4);
  const want = Math.min(4, cap, navigator.hardwareConcurrency || 2);
  if (!self.crossOriginIsolated || want < 2) return 1;
  return new Promise<number>((resolve) => {
    let probe: Worker | null = null;
    const finish = (n: number) => {
      clearTimeout(timer);
      probe?.terminate();
      resolve(n);
    };
    const timer = setTimeout(() => finish(1), 8000);
    try {
      probe = new Worker("/ort-probe.js");
      probe.onmessage = () => finish(want);
      probe.onerror = () => finish(1);
      probe.postMessage({ threads: want });
    } catch {
      finish(1);
    }
  });
}

async function init(id: number): Promise<EngineInfo> {
  if (info) return info;

  post({ id, type: "progress", message: "Baixando modelos (só na primeira vez)" });
  const [lmBuf, sfBuf] = await Promise.all([loadModel(LANDMARKER_URL), loadModel(SFACE_URL)]);

  post({ id, type: "progress", message: "Preparando o detector de rostos" });
  fileset = await FilesetResolver.forVisionTasks("/vendor/mediapipe");
  const fs = fileset;
  const make = (makeLandmarker = (delegate: "GPU" | "CPU") =>
    FaceLandmarker.createFromOptions(fs, {
      baseOptions: { modelAssetBuffer: new Uint8Array(lmBuf), delegate },
      runningMode: "IMAGE",
      numFaces: 5,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    }));
  // Mede GPU e CPU com o tipo de chamada mais comum (bloco de 480 px) e
  // fica com o mais rapido. A GPU tem custo fixo de sincronizacao por chamada,
  // que em muitos computadores deixa o WASM (CPU) mais rapido para blocos.
  const probe = new OffscreenCanvas(TILE_PX, TILE_PX);
  const pctx = probe.getContext("2d")!;
  const grad = pctx.createLinearGradient(0, 0, TILE_PX, TILE_PX);
  grad.addColorStop(0, "#3a2416");
  grad.addColorStop(1, "#d9b08a");
  pctx.fillStyle = grad;
  pctx.fillRect(0, 0, TILE_PX, TILE_PX);
  const timeIt = (lm: FaceLandmarker) => {
    lm.detect(probe); // aquecimento
    const t0 = performance.now();
    for (let k = 0; k < 6; k++) lm.detect(probe);
    return (performance.now() - t0) / 6;
  };
  let lmDelegate: "GPU" | "CPU" = "CPU";
  let gpuMs = Infinity;
  try {
    const gpu = await withTimeout(make("GPU"), 20000);
    gpuMs = timeIt(gpu);
    landmarker = gpu;
    lmDelegate = "GPU";
  } catch {
    landmarker = null;
  }
  try {
    const cpu = await make("CPU");
    const cpuMs = timeIt(cpu);
    if (cpuMs < gpuMs) {
      landmarker?.close();
      landmarker = cpu;
      lmDelegate = "CPU";
    } else {
      cpu.close();
    }
  } catch {
    if (!landmarker) throw new Error("Não foi possível iniciar o detector de rostos.");
  }

  post({ id, type: "progress", message: "Preparando o reconhecimento de pessoas" });
  (self as unknown as { importScripts(u: string): void }).importScripts("/vendor/ort/ort.all.min.js");
  ort.env.wasm.wasmPaths = "/vendor/ort/";
  ort.env.wasm.numThreads = await probeThreads();
  ort.env.logLevel = "error";

  // WASM primeiro (sempre funciona); depois tenta os aceleradores de GPU.
  const providers: string[] = ["wasm"];
  if ("gpu" in navigator) providers.push("webgpu");
  providers.push("webgl");
  // Testa cada acelerador e fica com o mais rapido neste computador.
  let used = "wasm";
  let bestMs = Infinity;
  for (const ep of providers) {
    let s: OrtTypes.InferenceSession | null = null;
    try {
      s = await withTimeout(
        ort.InferenceSession.create(sfBuf, { executionProviders: [ep], graphOptimizationLevel: "all", logSeverityLevel: 3 }),
        ep === "wasm" ? 60000 : 20000
      );
      const inName = s.inputNames[0];
      const probe = new Float32Array(3 * 112 * 112).map((_, i) => (i * 37) % 255);
      const run = () => s!.run({ [inName]: new ort.Tensor("float32", probe, [1, 3, 112, 112]) });
      const out = await withTimeout(run(), 15000); // aquecimento
      const v = out[s.outputNames[0]].data as Float32Array;
      if (!v || v.length !== 128 || !Number.isFinite(v[0])) throw new Error("saida invalida");
      const t0 = performance.now();
      for (let k = 0; k < 3; k++) await run();
      const ms = (performance.now() - t0) / 3;
      if (ms < bestMs) {
        if (sface) await sface.release();
        sface = s;
        sfaceInput = inName;
        used = ep;
        bestMs = ms;
      } else {
        await s.release();
      }
    } catch {
      if (s && s !== sface) await s.release().catch(() => {});
    }
  }
  if (!sface) throw new Error("Não foi possível iniciar o reconhecimento de rostos.");
  await initYunet();

  info = { landmarker: lmDelegate, recognizer: `${used.toUpperCase()} ${bestMs.toFixed(0)}ms ${ort.env.wasm.numThreads}t` };
  return info;
}

// Canvases reaproveitados
let detCanvas: OffscreenCanvas | null = null;
let detCtx: OffscreenCanvasRenderingContext2D | null = null;
const sharpCanvas = new OffscreenCanvas(SHARP_WIDTH, SHARP_WIDTH);
const sharpCtx = sharpCanvas.getContext("2d", { willReadFrequently: true })!;
const alignCanvas = new OffscreenCanvas(112, 112);
const alignCtx = alignCanvas.getContext("2d", { willReadFrequently: true })!;

const EXPRESSION_KEYS: (keyof Expression)[] = [
  "eyeBlinkLeft", "eyeBlinkRight", "jawOpen", "mouthFunnel",
  "mouthPucker", "mouthRollLower", "mouthSmileLeft", "mouthSmileRight",
];

/** Nitidez (variancia do Laplaciano) e luz do rosto no recorte em resolucao cheia. */
function measureCrop(bitmap: ImageBitmap, x: number, y: number, w: number, h: number) {
  const outH = Math.max(8, Math.round((h / w) * SHARP_WIDTH));
  if (sharpCanvas.height !== outH) sharpCanvas.height = outH;
  sharpCtx.imageSmoothingQuality = "high";
  sharpCtx.drawImage(bitmap, x, y, w, h, 0, 0, SHARP_WIDTH, outH);
  const { data } = sharpCtx.getImageData(0, 0, SHARP_WIDTH, outH);
  const W = SHARP_WIDTH, H = outH;
  const gray = new Float32Array(W * H);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }
  let sum = 0, sum2 = 0, n = 0;
  for (let yy = 1; yy < H - 1; yy++) {
    for (let xx = 1; xx < W - 1; xx++) {
      const i = yy * W + xx;
      const lap = gray[i - 1] + gray[i + 1] + gray[i - W] + gray[i + W] - 4 * gray[i];
      sum += lap; sum2 += lap * lap; n++;
    }
  }
  const mean = n ? sum / n : 0;
  const sharpness = n ? sum2 / n - mean * mean : 0;

  // luz: area central do rosto (evita fundo e cabelo)
  const x0 = Math.floor(W * 0.2), x1 = Math.ceil(W * 0.8);
  const y0 = Math.floor(H * 0.2), y1 = Math.ceil(H * 0.85);
  let lum = 0, clipped = 0, cnt = 0;
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const g = gray[yy * W + xx];
      lum += g; cnt++;
      if (g >= 245) clipped++;
    }
  }
  const avg = cnt ? lum / cnt / 255 : 0;
  const clipFrac = cnt ? clipped / cnt : 0;
  const light = clamp01(1 - Math.abs(avg - 0.52) / 0.45) * clamp01(1 - clipFrac * 4);
  return { sharpness, light };
}

/** Impressao digital SFace com alinhamento por similaridade para 112x112. */
async function embed(bitmap: ImageBitmap, pts: Pt[]): Promise<Float32Array> {
  const [a, b, tx, ty] = similarityTransform(pts, ARCFACE_TEMPLATE);
  alignCtx.setTransform(1, 0, 0, 1, 0, 0);
  alignCtx.fillStyle = "#000";
  alignCtx.fillRect(0, 0, 112, 112);
  alignCtx.setTransform(a, b, -b, a, tx, ty);
  alignCtx.imageSmoothingQuality = "high";
  alignCtx.drawImage(bitmap, 0, 0);
  alignCtx.setTransform(1, 0, 0, 1, 0, 0);
  const { data } = alignCtx.getImageData(0, 0, 112, 112);
  const plane = 112 * 112;
  const input = new Float32Array(3 * plane);
  for (let i = 0, p = 0; i < plane; i++, p += 4) {
    input[i] = data[p];             // R
    input[plane + i] = data[p + 1]; // G
    input[2 * plane + i] = data[p + 2]; // B
  }
  const tensor = new ort.Tensor("float32", input, [1, 3, 112, 112]);
  const out = await sface!.run({ [sfaceInput]: tensor });
  const vec = new Float32Array(out[sface!.outputNames[0]].data as Float32Array);
  return normalize(vec);
}

function poseFromMatrix(m: number[] | Float32Array | undefined) {
  if (!m || m.length < 16) return { yaw: 0, pitch: 0 };
  // matriz 4x4 em ordem de coluna; a 3a coluna e o vetor "para frente" do rosto
  const fx = m[8], fy = m[9], fz = m[10];
  const yaw = (Math.atan2(fx, fz) * 180) / Math.PI;
  const pitch = (Math.atan2(-fy, Math.hypot(fx, fz)) * 180) / Math.PI;
  return { yaw, pitch };
}

// Deteccao em blocos ampliados: o detector do FaceLandmarker e de curto
// alcance e perde rostos pequenos (pregador em plano aberto). Alem do quadro
// inteiro, olhamos blocos quadrados sobrepostos da parte de cima do quadro.
const tiling = { frac: 0.5, maxY: 0.9, overlap: 0.25 };
const TILE_PX = 480;
let tileCanvas: OffscreenCanvas | null = null;
let tileCtx: OffscreenCanvasRenderingContext2D | null = null;

interface RawFace {
  /** pontos em pixels do frame cheio */
  pts: { x: number; y: number }[];
  box: { x: number; y: number; w: number; h: number };
  blend: { categoryName: string; score: number }[];
  matrix?: number[] | Float32Array;
  /** altura do rosto em pixels na imagem que o detector viu */
  detH: number;
  inside: number;
  /** quao longe da borda do bloco o rosto ficou (1 = bem dentro) */
  margin: number;
}

function collect(
  res: FaceLandmarkerResult, sx: number, sy: number, sw: number, sh: number,
  srcH: number, isTile: boolean, W: number, H: number, out: RawFace[]
) {
  for (let i = 0; i < res.faceLandmarks.length; i++) {
    const lm = res.faceLandmarks[i];
    let minX = 1, minY = 1, maxX = 0, maxY = 0, inside = 0;
    for (const p of lm) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
      if (p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1) inside++;
    }
    const pts = lm.map((p) => ({ x: sx + p.x * sw, y: sy + p.y * sh }));
    const x0 = Math.max(0, sx + minX * sw), y0 = Math.max(0, sy + minY * sh);
    const x1 = Math.min(W, sx + maxX * sw), y1 = Math.min(H, sy + maxY * sh);
    if (x1 - x0 < 8 || y1 - y0 < 8) continue;
    const edge = Math.min(minX, minY, 1 - maxX, 1 - maxY);
    const fw = Math.max(maxX - minX, 1e-3);
    const margin = isTile ? clamp01(edge / (fw * 0.25)) : 1;
    out.push({
      pts,
      box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
      blend: res.faceBlendshapes?.[i]?.categories ?? [],
      matrix: res.facialTransformationMatrixes?.[i]?.data,
      detH: (maxY - minY) * srcH,
      inside: inside / lm.length,
      margin,
    });
  }
}

function iou(a: RawFace["box"], b: RawFace["box"]) {
  const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  return inter / (a.w * a.h + b.w * b.h - inter);
}

function quality(f: RawFace) {
  return f.margin * clamp01(f.detH / 60) * f.inside;
}

// Varredura adaptativa: todos os blocos a cada SWEEP_EVERY frames; nos outros,
// so os blocos onde apareceu rosto ha pouco tempo.
const SWEEP_EVERY = 3;
const HOT_FRAMES = 7;
let frameNo = 0;
const hotUntil = new Map<string, number>();

function detectSquare(bitmap: ImageBitmap, sx: number, sy: number, S: number, ms: { draw: number; detect: number }, raw: RawFace[]) {
  const T = Math.min(Math.round(S), TILE_PX);
  if (!tileCanvas || tileCanvas.width !== T) {
    tileCanvas = new OffscreenCanvas(T, T);
    tileCtx = tileCanvas.getContext("2d")!;
  }
  let c0 = performance.now();
  tileCtx!.drawImage(bitmap, sx, sy, S, S, 0, 0, T, T);
  ms.draw += performance.now() - c0;
  c0 = performance.now();
  const before = raw.length;
  collect(landmarker!.detect(tileCanvas), sx, sy, S, S, T, true, bitmap.width, bitmap.height, raw);
  ms.detect += performance.now() - c0;
  return raw.length > before;
}

function detectAll(
  bitmap: ImageBitmap,
  ms: { draw: number; detect: number },
  mode: "scan" | "full",
  roi?: Box
): RawFace[] {
  const W = bitmap.width, H = bitmap.height;
  const raw: RawFace[] = [];

  if (roi) {
    // refinamento: so a regiao em volta do rosto candidato
    const side = Math.min(Math.max(roi.w, roi.h), W, H);
    const sx = Math.max(0, Math.min(W - side, roi.x + roi.w / 2 - side / 2));
    const sy = Math.max(0, Math.min(H - side, roi.y + roi.h / 2 - side / 2));
    detectSquare(bitmap, sx, sy, side, ms, raw);
  } else {
    const dw = Math.min(DETECT_WIDTH, W);
    const dh = Math.round((H / W) * dw);
    if (!detCanvas || detCanvas.width !== dw || detCanvas.height !== dh) {
      detCanvas = new OffscreenCanvas(dw, dh);
      detCtx = detCanvas.getContext("2d")!;
    }
    let c0 = performance.now();
    detCtx!.drawImage(bitmap, 0, 0, dw, dh);
    ms.draw += performance.now() - c0;
    c0 = performance.now();
    collect(landmarker!.detect(detCanvas), 0, 0, W, H, dh, false, W, H, raw);
    ms.detect += performance.now() - c0;

    if (tiling.frac > 0) {
      frameNo++;
      const sweep = mode === "full" || frameNo % SWEEP_EVERY === 1;
      const S = Math.round(tiling.frac * Math.min(W, H));
      const stride = Math.max(1, Math.round(S * (1 - tiling.overlap)));
      const xs: number[] = [], ys: number[] = [];
      for (let x = 0; ; x += stride) { xs.push(Math.max(0, Math.min(x, W - S))); if (x + S >= W) break; }
      const yLimit = H * tiling.maxY;
      for (let y = 0; ; y += stride) { ys.push(Math.max(0, Math.min(y, H - S))); if (y + S >= yLimit) break; }
      for (const ty of ys) {
        for (const tx of xs) {
          const key = `${W}x${H}:${tx},${ty}`;
          if (!sweep && (hotUntil.get(key) ?? -1) < frameNo) continue;
          if (detectSquare(bitmap, tx, ty, S, ms, raw)) hotUntil.set(key, frameNo + HOT_FRAMES);
        }
      }
    }
  }

  // junta deteccoes repetidas do mesmo rosto, ficando com a melhor
  raw.sort((a, b) => quality(b) - quality(a));
  const kept: RawFace[] = [];
  for (const f of raw) {
    const cx = f.box.x + f.box.w / 2, cy = f.box.y + f.box.h / 2;
    const dup = kept.some((k) =>
      iou(k.box, f.box) > 0.25 ||
      (cx > k.box.x && cx < k.box.x + k.box.w && cy > k.box.y && cy < k.box.y + k.box.h));
    if (!dup) kept.push(f);
  }
  return kept;
}

async function analyze(t: number, bitmap: ImageBitmap, mode: "scan" | "full", roi?: Box): Promise<FrameResult> {
  const W = bitmap.width, H = bitmap.height;
  const ms = { draw: 0, detect: 0, measure: 0, embed: 0 };
  const raws = detectAll(bitmap, ms, mode, roi);

  const faces: FaceRecord[] = [];
  for (const r of raws) {
    const { x: bx, y: by, w: bw, h: bh } = r.box;
    const lm = r.pts;
    const P = (k: number): Pt => [lm[k].x, lm[k].y];
    const leftEye = lm.length > 473 ? P(468) : P(33);
    const rightEye = lm.length > 473 ? P(473) : P(263);
    const pts: Pt[] = [leftEye, rightEye, P(1), P(61), P(291)];

    const roll = (Math.atan2(rightEye[1] - leftEye[1], rightEye[0] - leftEye[0]) * 180) / Math.PI;
    const { yaw, pitch } = poseFromMatrix(r.matrix);

    let c0 = performance.now();
    const { sharpness, light } = measureCrop(bitmap, bx, by, bw, bh);
    ms.measure += performance.now() - c0;
    c0 = performance.now();
    const embedding = await embed(bitmap, pts);
    ms.embed += performance.now() - c0;

    const expression = {} as Expression;
    for (const k of EXPRESSION_KEYS) expression[k] = 0;
    for (const c of r.blend) {
      if ((EXPRESSION_KEYS as string[]).includes(c.categoryName)) {
        expression[c.categoryName as keyof Expression] = c.score;
      }
    }

    const cx = (bx + bw / 2) / W - 0.5, cy = (by + bh / 2) / H - 0.5;
    const centerDist = clamp01(Math.hypot(cx, cy) / Math.hypot(0.5, 0.5));
    // O MediaPipe nao expoe a confianca: usamos quanto do rosto ficou no
    // quadro e se o rosto tinha tamanho suficiente para o detector.
    const confidence = r.inside * clamp01(r.detH / 48);

    faces.push({
      t,
      box: { x: bx, y: by, w: bw, h: bh },
      area: (bw * bh) / (W * H),
      centerDist,
      sharpness,
      light,
      yaw,
      pitch,
      roll,
      confidence,
      expression,
      embedding,
    });
  }
  return { t, width: W, height: H, faces, ms };
}

// ---------------------------------------------------------------------------
// Varredura rapida com YuNet: um detector de rostos pequeno (227 KB) que acha
// rostos pequenos numa unica passada no quadro, e ja devolve os 5 pontos
// (olhos, nariz, cantos da boca) que o SFace precisa. O FaceLandmarker fica
// so para o refinamento, onde olhos e boca importam.

const YUNET_URL = "/models/face_detection_yunet_2023mar.onnx";
const YUNET_SIZE = 640;
const YUNET_SCORE = 0.7;
let yunet: OrtTypes.InferenceSession | null = null;
let yunetCanvas: OffscreenCanvas | null = null;
let yunetCtx: OffscreenCanvasRenderingContext2D | null = null;

async function initYunet() {
  if (yunet) return;
  const buf = await loadModel(YUNET_URL);
  yunet = await ort.InferenceSession.create(buf, { executionProviders: ["wasm"], graphOptimizationLevel: "all", logSeverityLevel: 3 });
}

interface YuFace { x: number; y: number; w: number; h: number; score: number; kps: Pt[] }

function nms(faces: YuFace[], thr: number): YuFace[] {
  faces.sort((a, b) => b.score - a.score);
  const kept: YuFace[] = [];
  for (const f of faces) {
    const ok = kept.every((k) => {
      const x0 = Math.max(k.x, f.x), y0 = Math.max(k.y, f.y);
      const x1 = Math.min(k.x + k.w, f.x + f.w), y1 = Math.min(k.y + k.h, f.y + f.h);
      const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
      return inter / (k.w * k.h + f.w * f.h - inter) < thr;
    });
    if (ok) kept.push(f);
  }
  return kept;
}

/** Roda o YuNet no quadro reduzido e devolve rostos em pixels do frame cheio. */
async function detectYunet(bitmap: ImageBitmap, ms: { draw: number; detect: number }): Promise<YuFace[]> {
  const W = bitmap.width, H = bitmap.height;
  // o modelo aceita so 640x640: o quadro entra inteiro, com borda preta embaixo
  const iw = YUNET_SIZE, ih = YUNET_SIZE;
  const s = Math.min(iw / W, ih / H);
  const dw = Math.round(W * s), dh = Math.round(H * s);
  if (!yunetCanvas || yunetCanvas.width !== iw || yunetCanvas.height !== ih) {
    yunetCanvas = new OffscreenCanvas(iw, ih);
    yunetCtx = yunetCanvas.getContext("2d", { willReadFrequently: true })!;
  }
  let c0 = performance.now();
  yunetCtx!.fillStyle = "#000";
  yunetCtx!.fillRect(0, 0, iw, ih);
  yunetCtx!.drawImage(bitmap, 0, 0, dw, dh);
  const { data } = yunetCtx!.getImageData(0, 0, iw, ih);
  const plane = iw * ih;
  const input = new Float32Array(3 * plane);
  for (let i = 0, p = 0; i < plane; i++, p += 4) {
    input[i] = data[p + 2];             // B
    input[plane + i] = data[p + 1];     // G
    input[2 * plane + i] = data[p];     // R
  }
  ms.draw += performance.now() - c0;

  c0 = performance.now();
  const out = await yunet!.run({ [yunet!.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, ih, iw]) });
  ms.detect += performance.now() - c0;

  const faces: YuFace[] = [];
  for (const stride of [8, 16, 32]) {
    const cls = out[`cls_${stride}`].data as Float32Array;
    const obj = out[`obj_${stride}`].data as Float32Array;
    const bbox = out[`bbox_${stride}`].data as Float32Array;
    const kps = out[`kps_${stride}`].data as Float32Array;
    const cols = iw / stride, rows = ih / stride;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const score = Math.sqrt(clamp01(cls[i]) * clamp01(obj[i]));
        if (score < YUNET_SCORE) continue;
        const cx = (c + bbox[i * 4]) * stride, cy = (r + bbox[i * 4 + 1]) * stride;
        const w = Math.exp(bbox[i * 4 + 2]) * stride, h = Math.exp(bbox[i * 4 + 3]) * stride;
        const pts: Pt[] = [];
        for (let k = 0; k < 5; k++) {
          pts.push([((kps[i * 10 + 2 * k] + c) * stride) / s, ((kps[i * 10 + 2 * k + 1] + r) * stride) / s]);
        }
        faces.push({ x: (cx - w / 2) / s, y: (cy - h / 2) / s, w: w / s, h: h / s, score, kps: pts });
      }
    }
  }
  return nms(faces, 0.3).filter((f) => f.h >= 16);
}

// Reaproveita a impressao digital de quem continua no mesmo lugar: rosto com
// boa sobreposicao a um rosto recente e a mesma pessoa, nao precisa do SFace.
interface Track { box: Box; emb: Float32Array; embAt: number; seenAt: number }
let tracks: Track[] = [];
let reuseWindow = 4;

function boxIou(a: Box, b: Box) {
  const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  return inter / (a.w * a.h + b.w * b.h - inter);
}

// Quadro praticamente igual ao anterior (camera parada, ninguem mexendo):
// repete o resultado anterior sem rodar os modelos.
const thumbCanvas = new OffscreenCanvas(64, 36);
const thumbCtx = thumbCanvas.getContext("2d", { willReadFrequently: true })!;
let lastThumb: Float32Array | null = null;
let lastResult: { t: number; faces: FaceRecord[] } | null = null;
const STATIC_DIFF = 1.6;

function frameThumb(bitmap: ImageBitmap) {
  thumbCtx.drawImage(bitmap, 0, 0, 64, 36);
  const { data } = thumbCtx.getImageData(0, 0, 64, 36);
  const g = new Float32Array(64 * 36);
  for (let i = 0, p = 0; i < g.length; i++, p += 4) g[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  return g;
}

/** Estimativa de giro e inclinacao a partir dos 5 pontos. */
function poseFromKps(k: Pt[]) {
  const [le, re, nose] = k;
  const midX = (le[0] + re[0]) / 2;
  const eyeDist = Math.hypot(re[0] - le[0], re[1] - le[1]) || 1;
  // calibrado contra a pose do FaceLandmarker: o nariz se desloca ~0,6 x a
  // distancia entre os olhos vezes a tangente do giro
  const yaw = (Math.atan((nose[0] - midX) / eyeDist / 0.6) * 180) / Math.PI;
  const roll = (Math.atan2(re[1] - le[1], re[0] - le[0]) * 180) / Math.PI;
  return { yaw, roll };
}

async function analyzeFast(t: number, bitmap: ImageBitmap): Promise<FrameResult> {
  const W = bitmap.width, H = bitmap.height;
  const ms = { draw: 0, detect: 0, measure: 0, embed: 0, skipped: 0, reused: 0 };

  const thumb = frameThumb(bitmap);
  if (lastThumb && lastResult && t > lastResult.t && t - lastResult.t <= reuseWindow) {
    let diff = 0;
    for (let i = 0; i < thumb.length; i++) diff += Math.abs(thumb[i] - lastThumb[i]);
    if (diff / thumb.length < STATIC_DIFF) {
      ms.skipped = 1;
      lastResult = { t, faces: lastResult.faces.map((f) => ({ ...f, t })) };
      return { t, width: W, height: H, faces: lastResult.faces, ms };
    }
  }
  lastThumb = thumb;

  const found = await detectYunet(bitmap, ms);
  tracks = tracks.filter((tr) => t - tr.seenAt <= reuseWindow && tr.seenAt <= t);
  const faces: FaceRecord[] = [];
  for (const f of found) {
    const bx = Math.max(0, f.x), by = Math.max(0, f.y);
    const bw = Math.min(W, f.x + f.w) - bx, bh = Math.min(H, f.y + f.h) - by;
    if (bw < 8 || bh < 8) continue;
    const box = { x: bx, y: by, w: bw, h: bh };
    // pontos na ordem do SFace: olhos (esquerda->direita na imagem), nariz, boca
    const eyes = [f.kps[0], f.kps[1]].sort((a, b) => a[0] - b[0]);
    const mouth = [f.kps[3], f.kps[4]].sort((a, b) => a[0] - b[0]);
    const pts: Pt[] = [eyes[0], eyes[1], f.kps[2], mouth[0], mouth[1]];
    const { yaw, roll } = poseFromKps(pts);

    let c0 = performance.now();
    const { sharpness, light } = measureCrop(bitmap, bx, by, bw, bh);
    ms.measure += performance.now() - c0;

    let embedding: Float32Array;
    const tr = tracks.find((k) => boxIou(k.box, box) >= 0.5 && t - k.embAt <= reuseWindow);
    if (tr) {
      embedding = tr.emb;
      tr.box = box;
      tr.seenAt = t;
      ms.reused++;
    } else {
      c0 = performance.now();
      embedding = await embed(bitmap, pts);
      ms.embed += performance.now() - c0;
      tracks.push({ box, emb: embedding, embAt: t, seenAt: t });
    }

    const expression = {} as Expression;
    for (const k of EXPRESSION_KEYS) expression[k] = 0;
    const cx = (bx + bw / 2) / W - 0.5, cy = (by + bh / 2) / H - 0.5;
    faces.push({
      t,
      box,
      area: (bw * bh) / (W * H),
      centerDist: clamp01(Math.hypot(cx, cy) / Math.hypot(0.5, 0.5)),
      sharpness,
      light,
      yaw,
      pitch: 0,
      roll,
      confidence: f.score,
      expression,
      embedding,
    });
  }
  lastResult = { t, faces };
  return { t, width: W, height: H, faces, ms };
}


// ---------------------------------------------------------------------------
// Postura do corpo. So roda nos frames finais (dezenas por video), entao usa
// a CPU e e carregado na primeira vez que precisa.

function getPoser(): Promise<PoseLandmarker> {
  if (!poser) {
    poser = (async () => {
      const buf = await loadModel(POSE_URL);
      return PoseLandmarker.createFromOptions(fileset!, {
        baseOptions: { modelAssetBuffer: new Uint8Array(buf), delegate: "CPU" },
        runningMode: "IMAGE",
        numPoses: 2,
        minPoseDetectionConfidence: 0.4,
        minPosePresenceConfidence: 0.4,
      });
    })().catch((e) => {
      poser = null;
      throw e;
    });
  }
  return poser;
}

const POSE_PX = 384;
const poseCanvas = new OffscreenCanvas(POSE_PX, POSE_PX);
const poseCtx = poseCanvas.getContext("2d")!;
const deg = (r: number) => (r * 180) / Math.PI;
const ramp = (v: number, good: number, bad: number) =>
  good < bad ? clamp01(1 - (v - good) / (bad - good)) : clamp01((v - bad) / (good - bad));

/**
 * Mede se a pessoa esta ereta: tronco na vertical, ombros nivelados, cabeca
 * erguida e centrada sobre os ombros, sem mao na frente do rosto.
 */
async function measurePosture(bitmap: ImageBitmap, face: Box): Promise<Posture> {
  const W = bitmap.width, H = bitmap.height;
  // recorte do corpo: um pouco acima da cabeca ate a cintura
  const fh = face.h;
  const cw = Math.min(W, fh * 7);
  const ch = Math.min(H, fh * 8);
  const cx = Math.max(0, Math.min(W - cw, face.x + face.w / 2 - cw / 2));
  const cy = Math.max(0, Math.min(H - ch, face.y - fh * 1.2));
  const k = POSE_PX / Math.max(cw, ch);
  const dw = Math.round(cw * k), dh = Math.round(ch * k);
  poseCanvas.width = dw;
  poseCanvas.height = dh;
  poseCtx.drawImage(bitmap, cx, cy, cw, ch, 0, 0, dw, dh);

  const none: Posture = { found: false, torsoTilt: 0, shoulderTilt: 0, headLift: 0, headOffset: 0, handOverFace: false, score: 0.5 };
  const res = (await getPoser()).detect(poseCanvas);
  if (!res.landmarks.length) return none;

  // varias pessoas no recorte: fica com a que tem o nariz mais perto do rosto
  const fcx = face.x + face.w / 2, fcy = face.y + face.h / 2;
  const toFull = (p: { x: number; y: number }) => ({ x: cx + p.x * cw, y: cy + p.y * ch });
  let best = res.landmarks[0], bestD = Infinity;
  for (const lm of res.landmarks) {
    const n = toFull(lm[0]);
    const d = Math.hypot(n.x - fcx, n.y - fcy);
    if (d < bestD) { bestD = d; best = lm; }
  }
  if (bestD > face.h * 1.5) return none;

  const P = (i: number) => ({ ...toFull(best[i]), v: best[i].visibility ?? 1 });
  const nose = P(0), ls = P(11), rs = P(12), lh = P(23), rh = P(24), lw = P(15), rw = P(16);
  if (ls.v < 0.5 || rs.v < 0.5) return none;

  const sw = Math.hypot(ls.x - rs.x, ls.y - rs.y) || 1;
  const midS = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
  let shoulderTilt = Math.abs(deg(Math.atan2(ls.y - rs.y, ls.x - rs.x)));
  if (shoulderTilt > 90) shoulderTilt = 180 - shoulderTilt;

  // tronco: com quadril visivel, linha ombros -> quadril; sem quadril (pulpito
  // na frente), usa o deslocamento da cabeca sobre os ombros
  let torsoTilt = 0;
  if (lh.v > 0.5 && rh.v > 0.5) {
    const midH = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
    torsoTilt = Math.abs(deg(Math.atan2(midH.x - midS.x, midH.y - midS.y)));
  }
  const headOffset = Math.abs(nose.x - midS.x) / sw;
  const headLift = (midS.y - nose.y) / sw;

  const fx0 = face.x - face.w * 0.1, fx1 = face.x + face.w * 1.1;
  const fy0 = face.y, fy1 = face.y + face.h * 0.7;
  const covers = (w: { x: number; y: number; v: number }) => w.v > 0.5 && w.x > fx0 && w.x < fx1 && w.y > fy0 && w.y < fy1;
  const handOverFace = covers(lw) || covers(rw);

  const score =
    0.3 * ramp(torsoTilt, 8, 30) +
    0.25 * ramp(shoulderTilt, 5, 20) +
    0.25 * ramp(headOffset, 0.2, 0.7) +
    0.2 * ramp(headLift, 0.55, 0.25);

  return {
    found: true,
    torsoTilt,
    shoulderTilt,
    headLift,
    headOffset,
    handOverFace,
    score: handOverFace ? score * 0.4 : score,
  };
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  try {
    if (msg.type === "init") {
      const i = await init(msg.id);
      post({ id: msg.id, type: "ready", info: i });
    } else if (msg.type === "config") {
      Object.assign(tiling, msg.tiling);
      if (msg.reuseWindow) reuseWindow = msg.reuseWindow;
      if (msg.thresholds && landmarker) {
        await landmarker.setOptions({
          minFaceDetectionConfidence: msg.thresholds.det,
          minFacePresenceConfidence: msg.thresholds.pres,
        });
      }
      if (msg.delegate && makeLandmarker) {
        landmarker?.close();
        landmarker = await makeLandmarker(msg.delegate);
      }
      post({ id: msg.id, type: "ready", info: info! });
    } else if (msg.type === "pose") {
      try {
        post({ id: msg.id, type: "pose", posture: await measurePosture(msg.bitmap, msg.face) });
      } finally {
        msg.bitmap.close();
      }
    } else if (msg.type === "analyze") {
      try {
        const mode = msg.mode ?? "scan";
        const result = mode === "scan" && !msg.roi && yunet
          ? await analyzeFast(msg.t, msg.bitmap)
          : await analyze(msg.t, msg.bitmap, mode, msg.roi);
        post({ id: msg.id, type: "result", result });
      } finally {
        msg.bitmap.close();
      }
    }
  } catch (err) {
    post({ id: msg.id, type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
