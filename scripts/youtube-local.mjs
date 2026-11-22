// Ajudante local para links do YouTube (so roda no seu computador).
//
// O site no navegador nao consegue ler videos do YouTube. Este ajudante usa o
// yt-dlp instalado na sua maquina, pela sua internet, para baixar:
//   - uma versao leve (ate 360p) para a analise;
//   - depois, a versao em ate 1080p, de onde saem as fotos escolhidas.
// Os arquivos ficam numa pasta temporaria e sao apagados depois de 24 h.
//
// Rodar: node scripts/youtube-local.mjs   (o "npm run dev" ja inicia junto)

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = Number(process.env.YT_HELPER_PORT || 3001);
const PYTHON = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
const CACHE = join(tmpdir(), "frame-do-pregador-youtube");
const ORIGINS = new Set(["http://localhost:3000", "http://127.0.0.1:3000"]);

const FORMATS = {
  low: "bv*[height<=360][vcodec^=avc1][ext=mp4]/bv*[height<=480][ext=mp4]/b[height<=480][ext=mp4]",
  high: "bv*[height<=1080][vcodec^=avc1][ext=mp4]/bv*[height<=1080][ext=mp4]/b[ext=mp4]",
};

mkdirSync(CACHE, { recursive: true });
// limpa arquivos com mais de 24 h
for (const f of readdirSync(CACHE)) {
  const p = join(CACHE, f);
  try {
    if (Date.now() - statSync(p).mtimeMs > 24 * 3600 * 1000) unlinkSync(p);
  } catch {
    /* ignora */
  }
}

/** Aceita so links do YouTube e devolve o id de 11 caracteres. */
function videoId(input) {
  const s = String(input || "").trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s.startsWith("http") ? s : `https://${s}`);
    const host = u.hostname.replace(/^(www|m|music)\./, "");
    if (host === "youtu.be") return /^\/([\w-]{11})/.exec(u.pathname)?.[1] ?? null;
    if (host === "youtube.com") {
      const v = u.searchParams.get("v");
      if (v && /^[\w-]{11}$/.test(v)) return v;
      return /^\/(?:live|shorts|embed)\/([\w-]{11})/.exec(u.pathname)?.[1] ?? null;
    }
  } catch {
    /* nao e URL */
  }
  return null;
}

/** jobs[id-quality] = { state, loaded, total, title, error } */
const jobs = new Map();
const fileOf = (id, q) => join(CACHE, `${id}-${q}.mp4`);

function friendlyError(text) {
  if (/Sign in to confirm|not a bot/i.test(text)) return "O YouTube pediu confirmação de que não é robô. Tente de novo em alguns minutos.";
  if (/Private video|members-only|age/i.test(text)) return "Esse vídeo é privado ou tem restrição. Baixe pelo YouTube Studio e escolha o arquivo.";
  if (/is not a valid URL|Unsupported URL|Incomplete YouTube ID/i.test(text)) return "Esse link não parece ser de um vídeo do YouTube.";
  if (/live event|is live/i.test(text)) return "Essa transmissão ainda está ao vivo. Espere terminar e tente de novo.";
  if (/requested format is not available/i.test(text)) return "Não achamos uma versão MP4 desse vídeo. Baixe o arquivo e escolha no computador.";
  return "Não deu para baixar esse vídeo agora. Confira o link e tente de novo.";
}

function start(id, q) {
  const key = `${id}-${q}`;
  const existing = jobs.get(key);
  if (existing && existing.state !== "error") return existing;
  const out = fileOf(id, q);
  if (existsSync(out)) {
    const size = statSync(out).size;
    const job = { state: "done", loaded: size, total: size, title: existing?.title ?? jobs.get(`${id}-low`)?.title ?? "" };
    jobs.set(key, job);
    return job;
  }

  const job = { state: "downloading", loaded: 0, total: 0, title: "", error: "" };
  jobs.set(key, job);
  const args = [
    "-m", "yt_dlp",
    "--js-runtimes", "node",
    "--no-playlist", "--no-part", "--newline", "--no-simulate",
    "-f", FORMATS[q],
    "--print", "before_dl:TITLE %(title)s",
    "--progress-template", "download:PROG %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s",
    "-o", out,
    `https://www.youtube.com/watch?v=${id}`,
  ];
  const child = spawn(PYTHON, args, { windowsHide: true });
  let errText = "";
  const onLine = (line) => {
    if (line.startsWith("TITLE ")) job.title = line.slice(6).trim();
    else if (line.startsWith("PROG ")) {
      const [, a, b, c] = line.trim().split(/\s+/);
      job.loaded = Number(a) || job.loaded;
      job.total = Number(b) || Number(c) || job.total;
    }
  };
  let buf = "";
  child.stdout.on("data", (d) => {
    buf += d.toString("utf8");
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      onLine(buf.slice(0, i).replace(/\r$/, ""));
      buf = buf.slice(i + 1);
    }
  });
  child.stderr.on("data", (d) => { errText += d.toString("utf8"); });
  child.on("error", () => {
    job.state = "error";
    job.error = "O yt-dlp não foi encontrado. Instale com: python -m pip install -U \"yt-dlp[default]\"";
  });
  child.on("close", (code) => {
    if (code === 0 && existsSync(out)) {
      job.state = "done";
      job.total = job.loaded = statSync(out).size;
    } else if (job.state !== "error") {
      job.state = "error";
      job.error = friendlyError(errText);
      console.error(`[youtube] ${key} falhou:\n${errText.split("\n").slice(-6).join("\n")}`);
    }
  });
  return job;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
  res.end(JSON.stringify(body));
}

const server = createServer((req, res) => {
  const origin = req.headers.origin;
  const cors = {
    "Access-Control-Allow-Origin": origin && ORIGINS.has(origin) ? origin : "http://localhost:3000",
    "Access-Control-Allow-Headers": "Range",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range",
    "Cross-Origin-Resource-Policy": "cross-origin",
    Vary: "Origin",
  };
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    return res.end();
  }
  const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const q = u.searchParams.get("quality") === "high" ? "high" : "low";

  if (u.pathname === "/health") return send(res, 200, { ok: true }, cors);

  if (u.pathname === "/start") {
    const id = videoId(u.searchParams.get("url"));
    if (!id) return send(res, 400, { error: "Esse link não parece ser de um vídeo do YouTube." }, cors);
    const job = start(id, q);
    return send(res, 200, { id, ...job }, cors);
  }

  if (u.pathname === "/status") {
    const id = videoId(u.searchParams.get("id"));
    const job = id && jobs.get(`${id}-${q}`);
    if (!job) return send(res, 404, { error: "Download não encontrado." }, cors);
    return send(res, 200, { id, ...job }, cors);
  }

  if (u.pathname === "/file") {
    const id = videoId(u.searchParams.get("id"));
    const path = id && fileOf(id, q);
    if (!path || !existsSync(path)) return send(res, 404, { error: "Arquivo não encontrado." }, cors);
    const size = statSync(path).size;
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
    if (range) {
      const a = range[1] ? Number(range[1]) : 0;
      const b = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      res.writeHead(206, { ...cors, "Content-Type": "video/mp4", "Content-Length": b - a + 1, "Content-Range": `bytes ${a}-${b}/${size}`, "Accept-Ranges": "bytes" });
      return createReadStream(path, { start: a, end: b }).pipe(res);
    }
    res.writeHead(200, { ...cors, "Content-Type": "video/mp4", "Content-Length": size, "Accept-Ranges": "bytes" });
    return createReadStream(path).pipe(res);
  }

  send(res, 404, { error: "Rota não encontrada." }, cors);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[youtube] ajudante local em http://127.0.0.1:${PORT} (arquivos em ${CACHE})`);
});
