// Frame API: importa videos do YouTube com yt-dlp e extrai fotos com FFmpeg.
//
// Roda separada do Next.js (no seu computador para testes ou numa VM Linux).
// O Next.js chama esta API com um token (Authorization: Bearer) para criar
// tarefas, consultar e pedir a exportacao. O navegador recebe a previa e os
// PNGs direto daqui, por URLs assinadas (HMAC com o mesmo token) que vencem
// em poucos minutos. O token nunca vai para o navegador.
//
// Iniciar: npm run frame:api   (variaveis em .env.example)

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";

const env = process.env;
const host = env.FRAME_API_HOST || "127.0.0.1";
const port = Number(env.FRAME_API_PORT || 8787);
const token = env.FRAME_API_TOKEN;
const allowedOrigins = new Set((env.FRAME_API_ALLOWED_ORIGINS || "http://localhost:3000").split(",").map((s) => s.trim()).filter(Boolean));
const jsRuntime = env.YT_DLP_JS_RUNTIME || "node";

const LIMITS = {
  maxDuration: Number(env.FRAME_API_MAX_DURATION || 4 * 3600), // segundos
  maxFilesize: env.FRAME_API_MAX_FILESIZE || "1G",
  maxJobs: Number(env.FRAME_API_MAX_JOBS || 8),
  maxFrames: Number(env.FRAME_API_MAX_FRAMES || 30),
  jobTtl: Number(env.FRAME_API_JOB_TTL_MIN || 60) * 60 * 1000,
  downloadTimeout: 15 * 60 * 1000,
  frameTimeout: 30 * 1000,
};

if (!token || token.length < 24) {
  throw new Error("Defina FRAME_API_TOKEN com pelo menos 24 caracteres (o mesmo no Next.js).");
}

// yt-dlp: executavel (YT_DLP_PATH) ou o modulo Python (python -m yt_dlp)
const ytdlp = env.YT_DLP_PATH
  ? { bin: env.YT_DLP_PATH, pre: [] }
  : { bin: env.PYTHON || (process.platform === "win32" ? "python" : "python3"), pre: ["-m", "yt_dlp"] };
let ffmpeg = env.FFMPEG_PATH || "ffmpeg";

const jobs = new Map();
let active = 0;
const MAX_ACTIVE = Number(env.FRAME_API_MAX_ACTIVE || 1);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Autenticacao

function safeEqual(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function authorized(request) {
  return safeEqual(request.headers.authorization || "", "Bearer " + token);
}

/** Assinatura das URLs de midia: HMAC-SHA256(token, "GET\npath\nexp"). */
function sign(path, exp) {
  return createHmac("sha256", token).update(`GET\n${path}\n${exp}`).digest("base64url");
}

function validSignature(path, query) {
  const exp = Number(query.get("exp"));
  const sig = query.get("sig") || "";
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  return safeEqual(sig, sign(path, exp));
}

// ---------------------------------------------------------------------------
// Utilidades HTTP

function corsHeaders(request) {
  const origin = request.headers.origin;
  return {
    ...(origin && allowedOrigins.has(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
    "Access-Control-Expose-Headers": "Content-Length, Content-Range",
    // o site usa COEP require-corp: a midia precisa permitir uso entre origens
    "Cross-Origin-Resource-Policy": "cross-origin",
  };
}

function json(response, status, data, extra = {}) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra });
  response.end(JSON.stringify(data));
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16384) throw new HttpError(413, "Corpo da requisição muito grande.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Envie um JSON válido.");
  }
}

async function sendFile(request, response, file, contentType, extra) {
  const info = await stat(file).catch(() => null);
  if (!info) throw new HttpError(404, "Arquivo ainda indisponível.");
  const headers = { "Content-Type": contentType, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=600", ...extra };
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range || "");
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
    if (start > end || start >= info.size) {
      response.writeHead(416, { ...headers, "Content-Range": `bytes */${info.size}` });
      return response.end();
    }
    response.writeHead(206, { ...headers, "Content-Length": end - start + 1, "Content-Range": `bytes ${start}-${end}/${info.size}` });
    return pipeline(createReadStream(file, { start, end }), response);
  }
  response.writeHead(200, { ...headers, "Content-Length": info.size });
  return pipeline(createReadStream(file), response);
}

// ---------------------------------------------------------------------------
// Link do YouTube -> URL canonica

function videoIdFrom(value) {
  if (typeof value !== "string") throw new HttpError(400, "Informe um link do YouTube.");
  let url;
  try { url = new URL(value.trim()); } catch { throw new HttpError(400, "Esse link não é válido. Copie o endereço do vídeo no YouTube."); }
  if (!["https:", "http:"].includes(url.protocol)) throw new HttpError(400, "Esse link não é válido.");
  const hostName = url.hostname.replace(/^(www|m|music)\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  let id = null;
  if (hostName === "youtu.be") id = parts[0];
  else if (hostName === "youtube.com" || hostName === "youtube-nocookie.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else if (["live", "shorts", "embed", "v"].includes(parts[0])) id = parts[1];
  }
  if (!/^[\w-]{11}$/.test(id ?? "")) throw new HttpError(400, "Esse link não aponta para um vídeo do YouTube.");
  return id;
}

// ---------------------------------------------------------------------------
// Processos externos (sem shell: argumentos vao direto ao processo)

function run(bin, args, timeout) {
  return new Promise((resolve, reject) => {
    // UTF-8 na saida do Python: no Windows ele usaria outra codificacao e o
    // titulo chegaria com acentos quebrados
    const child = spawn(bin, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
    });
    let out = "", diag = "";
    let expired = false;
    const timer = setTimeout(() => { expired = true; child.kill("SIGKILL"); }, timeout);
    child.stdout.on("data", (c) => { out = (out + c).slice(-8000); });
    child.stderr.on("data", (c) => { diag = (diag + c).slice(-6000); });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(new Error(error.code === "ENOENT" ? `Programa não encontrado: ${bin}` : "Falha ao iniciar a ferramenta de vídeo."));
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && !expired) return resolve(out);
      if (diag) console.error(`[frame-api] ${bin} saiu com ${code}:\n${diag.split("\n").slice(-8).join("\n")}`);
      if (expired) return reject(new Error("O processamento passou do tempo limite."));
      reject(new Error(friendly(diag)));
    });
  });
}

function friendly(diag) {
  if (/confirm.*not a bot|Sign in to confirm/i.test(diag)) return "O YouTube pediu confirmação de que não é robô neste servidor. Tente mais tarde ou use o upload.";
  if (/HTTP Error 403/i.test(diag)) return "O YouTube recusou o download neste servidor. Tente mais tarde ou use o upload.";
  if (/is live|live event|does not pass filter.*is_live/i.test(diag)) return "Essa transmissão ainda está ao vivo. Espere terminar e tente de novo.";
  if (/does not pass filter.*duration/i.test(diag)) return `O vídeo é longo demais (máximo de ${Math.round(LIMITS.maxDuration / 3600)} h).`;
  if (/larger than max-filesize|File is larger/i.test(diag)) return "O vídeo é grande demais para importar.";
  if (/Private video|members-only|confirm your age|age-restricted/i.test(diag)) return "Esse vídeo é privado ou tem restrição de idade. Use o upload do arquivo.";
  if (/Video unavailable|This video is unavailable|removed/i.test(diag)) return "Esse vídeo não está disponível no YouTube.";
  if (/Requested format is not available/i.test(diag)) return "Não há uma versão MP4 desse vídeo. Use o upload do arquivo.";
  return "Não deu para baixar esse vídeo. Confira o link ou use o upload.";
}

/** Baixa um MP4 de ate `height` linhas, de preferencia H.264 sem audio. */
async function download(job, height, file) {
  const fmt = [
    `bv*[height<=${height}][ext=mp4][vcodec^=avc1]`,
    `bv*[height<=${height}][ext=mp4]`,
    `b[height<=${height}][ext=mp4]`,
  ].join("/");
  const out = await run(ytdlp.bin, [
    ...ytdlp.pre,
    "--ignore-config", "--no-playlist", "--no-progress", "--no-warnings", "--no-mtime", "--encoding", "utf-8",
    "--js-runtimes", jsRuntime,
    "--match-filter", `!is_live & duration <= ${LIMITS.maxDuration}`,
    "--max-filesize", LIMITS.maxFilesize,
    "--socket-timeout", "20", "--retries", "3",
    "-f", fmt,
    "--no-simulate", "--print", "after_move:INFO\t%(duration)s\t%(width)s\t%(height)s\t%(title)s",
    "-o", file,
    "--", `https://www.youtube.com/watch?v=${job.videoId}`,
  ], LIMITS.downloadTimeout);
  const line = out.split(/\r?\n/).find((l) => l.startsWith("INFO\t"));
  if (!(await stat(file).catch(() => null))?.size) throw new Error("Nenhum MP4 encontrado para essa qualidade.");
  const [, duration, width, height2, title] = (line || "").split("\t");
  return { duration: Number(duration) || 0, width: Number(width) || 0, height: Number(height2) || 0, title: title || "" };
}

function launch(job, state, success, work) {
  if (active >= MAX_ACTIVE) throw new HttpError(429, "O servidor já está processando outro vídeo. Tente de novo em instantes.");
  active++;
  job.state = state;
  job.error = undefined;
  void Promise.resolve().then(work).then(() => { job.state = success; }).catch((error) => {
    job.state = "failed";
    job.error = error.message;
  }).finally(() => {
    job.expires = Date.now() + LIMITS.jobTtl;
    active--;
  });
}

function publicJob(job) {
  return {
    id: job.id,
    videoId: job.videoId,
    state: job.state,
    error: job.error,
    title: job.title,
    duration: job.duration,
    preview: job.preview ? { width: job.preview.width, height: job.preview.height } : undefined,
    source: job.source ? { width: job.source.width, height: job.source.height } : undefined,
    frames: job.frames,
    expiresAt: new Date(job.expires).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Rotas

async function handle(request, response) {
  const u = new URL(request.url, "http://localhost");
  const pathname = u.pathname;
  const cors = corsHeaders(request);

  if (request.method === "OPTIONS") {
    response.writeHead(204, { ...cors, "Access-Control-Allow-Methods": "GET", "Access-Control-Allow-Headers": "Range", "Access-Control-Max-Age": "600" });
    return response.end();
  }

  if (request.method === "GET" && pathname === "/health") return json(response, 200, { ok: true }, cors);

  const match = /^\/jobs\/([a-f0-9-]{36})(?:\/(preview|export|frames\/(\d+)))?$/.exec(pathname);

  // Midia: URL assinada (sem token), para o navegador baixar direto
  if (request.method === "GET" && match && (match[2] === "preview" || match[3] !== undefined)) {
    if (!validSignature(pathname, u.searchParams)) throw new HttpError(403, "Link expirado ou inválido.");
    const job = jobs.get(match[1]);
    if (!job) throw new HttpError(404, "Tarefa não encontrada.");
    if (match[2] === "preview") {
      if (!job.preview) throw new HttpError(404, "Prévia ainda indisponível.");
      return sendFile(request, response, join(job.folder, "preview.mp4"), "video/mp4", cors);
    }
    const n = Number(match[3]);
    if (job.state !== "complete" || !job.frames?.[n]) throw new HttpError(404, "Foto ainda indisponível.");
    return sendFile(request, response, join(job.folder, `${n}.png`), "image/png", cors);
  }

  // Controle: so com o token
  if (!authorized(request)) throw new HttpError(401, "Credencial inválida.");

  if (request.method === "POST" && pathname === "/jobs") {
    const videoId = videoIdFrom((await readJson(request))?.url);
    if (active >= MAX_ACTIVE || jobs.size >= LIMITS.maxJobs) throw new HttpError(429, "O servidor está ocupado. Tente de novo em instantes.");
    const id = randomUUID();
    const job = { id, videoId, expires: Date.now() + LIMITS.jobTtl };
    jobs.set(id, job);
    launch(job, "downloading", "ready", async () => {
      job.folder = await mkdtemp(join(tmpdir(), "frame-api-"));
      const info = await download(job, 360, join(job.folder, "preview.mp4"));
      job.title = info.title;
      job.duration = info.duration;
      job.preview = { width: info.width, height: info.height };
    });
    return json(response, 202, publicJob(job));
  }

  const job = match && jobs.get(match[1]);
  if (!job) throw new HttpError(404, "Tarefa não encontrada ou expirada.");

  if (request.method === "GET" && !match[2]) return json(response, 200, publicJob(job));

  if (request.method === "POST" && match[2] === "export") {
    const timestamps = (await readJson(request))?.timestamps;
    const maxT = job.duration || LIMITS.maxDuration;
    if (!Array.isArray(timestamps) || !timestamps.length || timestamps.length > LIMITS.maxFrames) {
      throw new HttpError(400, `Envie de 1 a ${LIMITS.maxFrames} instantes em segundos.`);
    }
    if (!timestamps.every((t) => typeof t === "number" && Number.isFinite(t) && t >= 0 && t < maxT)) {
      throw new HttpError(400, `Os instantes precisam estar entre 0 e ${maxT.toFixed(1)} s.`);
    }
    if (!job.preview || job.state === "downloading" || job.state === "exporting") {
      throw new HttpError(409, "A prévia precisa estar pronta antes de exportar.");
    }
    launch(job, "exporting", "complete", async () => {
      job.frames = undefined;
      const high = join(job.folder, "high.mp4");
      // reaproveita a versao alta se ja foi baixada nesta tarefa
      if (!job.source || !(await stat(high).catch(() => null))) {
        const info = await download(job, 1080, high);
        job.source = { width: info.width, height: info.height };
      }
      const frames = [];
      for (const [index, time] of timestamps.entries()) {
        const out = join(job.folder, `${index}.png`);
        await rm(out, { force: true });
        await run(ffmpeg, [
          "-nostdin", "-hide_banner", "-loglevel", "error",
          "-ss", time.toFixed(3), "-i", high,
          "-map", "0:v:0", "-frames:v", "1", "-update", "1", out,
        ], LIMITS.frameTimeout);
        if (!(await stat(out).catch(() => null))?.size) throw new Error(`Não há frame no instante ${time.toFixed(2)} s.`);
        frames.push({ index, time });
      }
      job.frames = frames;
    });
    return json(response, 202, publicJob(job));
  }

  throw new HttpError(404, "Recurso não encontrado.");
}

// Limpeza de tarefas vencidas (e seus arquivos)
setInterval(() => {
  for (const [id, job] of jobs) {
    if (["downloading", "exporting"].includes(job.state) || job.expires > Date.now()) continue;
    jobs.delete(id);
    if (job.folder) void rm(job.folder, { recursive: true, force: true }).catch(console.error);
  }
}, 60_000).unref();

/** Sem FFMPEG_PATH e sem ffmpeg no PATH, tenta o do pacote imageio-ffmpeg. */
async function resolveFfmpeg() {
  if (env.FFMPEG_PATH) return;
  try {
    await run(ffmpeg, ["-version"], 10_000);
  } catch {
    try {
      const out = await run(ytdlp.bin === env.YT_DLP_PATH ? "python3" : ytdlp.bin, ["-c", "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"], 10_000);
      ffmpeg = out.trim();
    } catch {
      console.warn("[frame-api] FFmpeg não encontrado. Defina FFMPEG_PATH; a exportação vai falhar sem ele.");
    }
  }
}

/** Ao iniciar, apaga pastas de tarefas de execucoes anteriores (as tarefas
 * ficam so na memoria; depois de reiniciar, os arquivos nao servem mais). */
async function cleanLeftovers() {
  for (const name of await readdir(tmpdir()).catch(() => [])) {
    if (name.startsWith("frame-api-")) await rm(join(tmpdir(), name), { recursive: true, force: true }).catch(() => {});
  }
}

await cleanLeftovers();
await resolveFfmpeg();
createServer((request, response) => {
  void handle(request, response).catch((error) => {
    if (response.headersSent) return response.destroy();
    if (!error.status) console.error(error);
    json(response, error.status || 500, { error: error.status ? error.message : "Erro interno da API." }, corsHeaders(request));
  });
}).listen(port, host, () => console.log(`[frame-api] em http://${host}:${port} (ffmpeg: ${ffmpeg})`));
