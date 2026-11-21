// Agrupamento de rostos em pessoas e escolha do provavel pregador.
import { cosine, median, normalize } from "./geometry";
import { expressionScore, frontalScore } from "./scoring";
import type { FaceRecord, FrameResult, Person } from "./types";

const JOIN = 0.4;
const MERGE = 0.4;
const BLURRY_JOIN = 0.22;

interface Group {
  sum: Float32Array;
  centroid: Float32Array;
  faces: FaceRecord[];
}

function addTo(g: Group, v: Float32Array) {
  for (let i = 0; i < v.length; i++) g.sum[i] += v[i];
  g.centroid = normalize(g.sum);
}

export function groupPeople(frames: FrameResult[]): Person[] {
  const all = frames.flatMap((f) => f.faces);
  if (!all.length) return [];

  const sharpLimit = Math.max(8, 0.3 * median(all.map((f) => f.sharpness)));
  const sharp = all.filter((f) => f.sharpness >= sharpLimit).sort((a, b) => b.area - a.area);
  const blurry = all.filter((f) => f.sharpness < sharpLimit);

  // 1. monta os grupos so com rostos nitidos, do maior para o menor
  let groups: Group[] = [];
  for (const f of sharp) {
    let best: Group | null = null, bestSim = -1;
    for (const g of groups) {
      const s = cosine(g.centroid, f.embedding);
      if (s > bestSim) { bestSim = s; best = g; }
    }
    if (best && bestSim >= JOIN) {
      best.faces.push(f);
      addTo(best, f.embedding);
    } else {
      groups.push({ sum: new Float32Array(f.embedding), centroid: f.embedding, faces: [f] });
    }
  }

  // 2. junta grupos parecidos
  let merged = true;
  while (merged && groups.length > 1) {
    merged = false;
    let bi = -1, bj = -1, bs = MERGE;
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const s = cosine(groups[i].centroid, groups[j].centroid);
        if (s >= bs) { bs = s; bi = i; bj = j; }
      }
    }
    if (bi >= 0) {
      const a = groups[bi], b = groups[bj];
      a.faces.push(...b.faces);
      for (let k = 0; k < a.sum.length; k++) a.sum[k] += b.sum[k];
      a.centroid = normalize(a.sum);
      groups = groups.filter((_, k) => k !== bj);
      merged = true;
    }
  }

  // 3. encaixa os rostos borrados no grupo mais parecido
  for (const f of blurry) {
    let best: Group | null = null, bestSim = -1;
    for (const g of groups) {
      const s = cosine(g.centroid, f.embedding);
      if (s > bestSim) { bestSim = s; best = g; }
    }
    if (best && bestSim >= BLURRY_JOIN) best.faces.push(f);
  }

  const total = frames.length || 1;
  const people: Person[] = groups
    .filter((g) => g.faces.length >= 2)
    .map((g, i) => {
      // um rosto por momento: se a mesma pessoa aparece 2x no frame, fica o maior
      const byT = new Map<number, FaceRecord>();
      for (const f of g.faces) {
        const cur = byT.get(f.t);
        if (!cur || f.area > cur.area) byT.set(f.t, f);
      }
      const faces = [...byT.values()].sort((a, b) => a.t - b.t);
      const moments = faces.length;
      const medArea = median(faces.map((f) => f.area));
      const medDist = median(faces.map((f) => f.centerDist));
      const score = moments * Math.sqrt(medArea) * (1.2 - medDist);
      // miniatura: boa qualidade e bem parecida com o centro do grupo
      // (evita rosto falso que entrou no grupo por engano)
      const thumbScore = (f: FaceRecord) => thumbQuality(f) * Math.max(0, cosine(g.centroid, f.embedding)) ** 3;
      const bestFace = faces.reduce((best, f) => (thumbScore(f) > thumbScore(best) ? f : best), faces[0]);
      return {
        id: i,
        centroid: g.centroid,
        faces,
        moments,
        percent: Math.min(100, (moments / total) * 100),
        score,
        bestFace,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((p, i) => ({ ...p, id: i }));

  return people;
}

/** Miniatura: rosto grande, nitido, de frente, bem iluminado e com boa expressao. */
function thumbQuality(f: FaceRecord) {
  return (
    Math.sqrt(f.area) *
    Math.log1p(f.sharpness) *
    (0.2 + frontalScore(f.yaw, f.pitch)) *
    (0.5 + f.light) *
    (0.2 + expressionScore(f.expression))
  );
}
