// Contas de geometria e estatistica usadas pelo worker e pela interface.

export type Pt = [number, number];

/** Template padrao de 5 pontos do ArcFace/SFace para recorte de 112x112. */
export const ARCFACE_TEMPLATE: Pt[] = [
  [38.2946, 51.6963], // olho esquerdo (lado esquerdo da imagem)
  [73.5318, 51.5014], // olho direito
  [56.0252, 71.7366], // ponta do nariz
  [41.5493, 92.3655], // canto esquerdo da boca
  [70.7299, 92.2041], // canto direito da boca
];

/**
 * Transformacao de similaridade (escala, rotacao e translacao) por minimos
 * quadrados que leva os pontos src para os pontos dst.
 * Retorna [a, b, tx, ty] tal que x' = a*x - b*y + tx e y' = b*x + a*y + ty.
 */
export function similarityTransform(src: Pt[], dst: Pt[]): [number, number, number, number] {
  const n = src.length;
  let sx = 0, sy = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    sx += src[i][0]; sy += src[i][1];
    dx += dst[i][0]; dy += dst[i][1];
  }
  sx /= n; sy /= n; dx /= n; dy /= n;
  let num1 = 0, num2 = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const px = src[i][0] - sx, py = src[i][1] - sy;
    const qx = dst[i][0] - dx, qy = dst[i][1] - dy;
    num1 += px * qx + py * qy;
    num2 += px * qy - py * qx;
    den += px * px + py * py;
  }
  const a = den > 0 ? num1 / den : 1;
  const b = den > 0 ? num2 / den : 0;
  const tx = dx - (a * sx - b * sy);
  const ty = dy - (b * sx + a * sy);
  return [a, b, tx, ty];
}

export function normalize(v: Float32Array): Float32Array {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const n = Math.sqrt(s) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

/** Similaridade de cosseno entre vetores ja normalizados. */
export function cosine(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Posicao relativa (0 a 1) de um valor dentro de uma lista ordenada. */
export function percentileRank(sorted: number[], value: number): number {
  if (sorted.length <= 1) return 1;
  let lo = 0, hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return Math.min(1, Math.max(0, (lo - 1) / (sorted.length - 1)));
}

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
