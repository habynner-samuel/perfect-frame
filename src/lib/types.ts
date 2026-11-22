// Tipos compartilhados entre a interface e o Web Worker.

export interface Box {
  /** coordenadas em pixels do frame em resolucao cheia */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Expression {
  eyeBlinkLeft: number;
  eyeBlinkRight: number;
  jawOpen: number;
  mouthFunnel: number;
  mouthPucker: number;
  mouthRollLower: number;
  mouthSmileLeft: number;
  mouthSmileRight: number;
}

/** Um rosto detectado num frame. Nunca guarda pixels, so numeros. */
export interface FaceRecord {
  /** tempo do frame em segundos */
  t: number;
  box: Box;
  /** area do rosto dividida pela area do frame (0 a 1) */
  area: number;
  /** distancia do centro do rosto ao centro do quadro (0 no centro, 1 no canto) */
  centerDist: number;
  /** variancia do Laplaciano no recorte do rosto com 160 px de largura */
  sharpness: number;
  /** nota de luz no rosto (0 a 1) */
  light: number;
  /** graus */
  yaw: number;
  pitch: number;
  roll: number;
  /** confianca aproximada da deteccao (0 a 1) */
  confidence: number;
  expression: Expression;
  /** impressao digital SFace, 128 numeros, normalizada */
  embedding: Float32Array;
}

export interface FrameResult {
  t: number;
  width: number;
  height: number;
  faces: FaceRecord[];
  /** tempos internos do worker (ms), para diagnostico */
  ms?: { draw: number; detect: number; measure: number; embed: number };
}

export interface ScanSettings {
  /** segundos entre frames analisados */
  interval: number;
  /** quantidade de fotos pedida */
  count: number;
  /** distancia minima entre fotos, em segundos */
  minGap: number;
}

export interface ScanData {
  key: string;
  fileName: string;
  interval: number;
  duration: number;
  width: number;
  height: number;
  /** indice do proximo frame a analisar */
  nextIndex: number;
  totalFrames: number;
  frames: FrameResult[];
  done: boolean;
  updatedAt: number;
}

export interface Person {
  id: number;
  centroid: Float32Array;
  faces: FaceRecord[];
  /** quantidade de momentos (frames) em que aparece */
  moments: number;
  /** porcentagem do video em que aparece (0 a 100) */
  percent: number;
  score: number;
  bestFace: FaceRecord;
  thumb?: string;
}

/** Postura do corpo no frame escolhido (MediaPipe PoseLandmarker). */
export interface Posture {
  /** encontrou ombros visiveis */
  found: boolean;
  /** inclinacao do tronco em relacao a vertical (graus) */
  torsoTilt: number;
  /** inclinacao da linha dos ombros (graus) */
  shoulderTilt: number;
  /** cabeca erguida: distancia do nariz acima dos ombros / largura dos ombros */
  headLift: number;
  /** cabeca deslocada para o lado em relacao ao centro dos ombros (em larguras de ombro) */
  headOffset: number;
  /** uma das maos cobrindo o rosto */
  handOverFace: boolean;
  /** nota de postura ereta (0 a 1) */
  score: number;
}

export interface Pick {
  t: number;
  face: FaceRecord;
  baseScore: number;
  expressionScore: number;
  postureScore: number;
  posture?: Posture;
  finalScore: number;
  crop: Box;
  frameWidth: number;
  frameHeight: number;
  preview?: string;
}

export interface EngineInfo {
  landmarker: "GPU" | "CPU";
  recognizer: string;
}

// Mensagens do worker
export type WorkerRequest =
  | { id: number; type: "init" }
  | { id: number; type: "analyze"; t: number; bitmap: ImageBitmap; mode?: "scan" | "full"; roi?: Box }
  | { id: number; type: "pose"; bitmap: ImageBitmap; face: Box }
  | { id: number; type: "config"; tiling: { frac?: number; maxY?: number; overlap?: number }; delegate?: "GPU" | "CPU"; thresholds?: { det: number; pres: number } };

export type WorkerResponse =
  | { id: number; type: "ready"; info: EngineInfo }
  | { id: number; type: "result"; result: FrameResult }
  | { id: number; type: "pose"; posture: Posture }
  | { id: number; type: "progress"; message: string }
  | { id: number; type: "error"; message: string };
