// Notas de cada frame da pessoa escolhida e recorte 4:5.
import { clamp01, percentileRank } from "./geometry";
import type { Box, Expression, FaceRecord } from "./types";

export interface PersonStats {
  sharpSorted: number[];
  areaSorted: number[];
}

export function personStats(faces: FaceRecord[]): PersonStats {
  return {
    sharpSorted: faces.map((f) => f.sharpness).sort((a, b) => a - b),
    areaSorted: faces.map((f) => f.area).sort((a, b) => a - b),
  };
}

/** Rosto de frente: giro leve ate 15 graus e otimo, perfil penaliza. */
export function frontalScore(yaw: number, pitch: number) {
  const y = Math.abs(yaw), p = Math.abs(pitch);
  const yawS = y <= 15 ? 1 : clamp01(1 - (y - 15) / 40);
  const pitchS = p <= 15 ? 1 : clamp01(1 - (p - 15) / 35);
  return yawS * (0.4 + 0.6 * pitchS);
}

/** Cabeca reta: penaliza acima de 6 graus, zera em 26. */
export function straightScore(roll: number) {
  const r = Math.abs(roll);
  return r <= 6 ? 1 : clamp01(1 - (r - 6) / 20);
}

/** Sozinho no quadro: 1 / (1 + 2 x area dos outros / area deste). */
export function aloneScore(face: FaceRecord, others: FaceRecord[]) {
  const otherArea = others.reduce((s, o) => s + o.area, 0);
  return 1 / (1 + (2 * otherArea) / Math.max(face.area, 1e-6));
}

export function baseScore(face: FaceRecord, others: FaceRecord[], stats: PersonStats) {
  return (
    0.3 * percentileRank(stats.sharpSorted, face.sharpness) +
    0.15 * percentileRank(stats.areaSorted, face.area) +
    0.2 * frontalScore(face.yaw, face.pitch) +
    0.08 * straightScore(face.roll) +
    0.12 * face.light +
    0.1 * aloneScore(face, others) +
    0.05 * face.confidence
  );
}

export function expressionScore(e: Expression) {
  const eyes = 1 - Math.max(e.eyeBlinkLeft, e.eyeBlinkRight);
  const mouth = e.jawOpen;
  const talking = Math.max(e.mouthFunnel, e.mouthPucker, e.mouthRollLower);
  const smile = (e.mouthSmileLeft + e.mouthSmileRight) / 2;
  const s =
    0.55 * Math.min(1, eyes / 0.7) +
    0.3 * (1 - Math.min(1, mouth / 0.35)) +
    0.15 * (1 - Math.min(1, talking / 0.5)) +
    0.15 * smile;
  return Math.min(1, s);
}

/** Recorte vertical 4:5 a partir do rosto. */
export function crop45(face: Box, W: number, H: number): Box {
  let h = Math.min(4.2 * face.h, H);
  let w = (h * 4) / 5;
  if (w > W) {
    w = W;
    h = Math.min(H, (w * 5) / 4);
  }
  // proporcao 4:5 exata em pixels inteiros: altura multipla de 5
  h = Math.max(5, Math.floor(h / 5) * 5);
  w = (h / 5) * 4;
  const cx = face.x + face.w / 2;
  let x = cx - w / 2;
  let y = face.y - 0.9 * face.h;
  x = Math.max(0, Math.min(W - w, x));
  y = Math.max(0, Math.min(H - h, y));
  return { x: Math.round(x), y: Math.round(y), w, h };
}
