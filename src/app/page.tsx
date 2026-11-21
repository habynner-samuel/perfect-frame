"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { Home } from "@/components/Home";
import { Results } from "@/components/Results";
import { Button, Card, Icon, Logo } from "@/components/ui";
import { getAnalyzer } from "@/lib/analyzer-client";
import { groupPeople } from "@/lib/people";
import {
  cropPng, download, fullPng, makePreviews, makeThumbs, runScan, selectBest, timeLabel,
  type ScanProgress,
} from "@/lib/pipeline";
import { deleteScan, loadScan } from "@/lib/storage";
import type { EngineInfo, Person, Pick, ScanData, ScanSettings } from "@/lib/types";
import { fileKey, VideoSource } from "@/lib/video";

type Phase = "inicio" | "varredura" | "resultado";
type Notice = { kind: "error" | "info"; text: string } | null;
type Resume = { file: File; saved: ScanData } | null;

const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|ogv)$/i;

function etaLabel(s: number | null) {
  if (s == null) return "calculando...";
  if (s < 60) return "menos de 1 min";
  const m = Math.round(s / 60);
  return m >= 60 ? `cerca de ${Math.floor(m / 60)} h ${m % 60} min` : `cerca de ${m} min`;
}

function supportProblem(): string | null {
  if (typeof window === "undefined") return null;
  const ok =
    typeof Worker !== "undefined" &&
    typeof OffscreenCanvas !== "undefined" &&
    typeof createImageBitmap !== "undefined" &&
    typeof indexedDB !== "undefined" &&
    typeof WebAssembly !== "undefined";
  return ok ? null : "Seu navegador não é compatível. Use o Google Chrome ou o Microsoft Edge atualizado, no computador.";
}

export default function Page() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const srcRef = useRef<VideoSource | null>(null);
  const scanRef = useRef<ScanData | null>(null);
  const scanAbort = useRef<AbortController | null>(null);
  const selAbort = useRef<AbortController | null>(null);
  const videoLock = useRef<Promise<unknown>>(Promise.resolve());
  const fpsRef = useRef(30);

  const [phase, setPhase] = useState<Phase>("inicio");
  const [settings, setSettings] = useState<ScanSettings>({ interval: 1, count: 12, minGap: 6 });
  const [notice, setNotice] = useState<Notice>(null);
  const [resume, setResume] = useState<Resume>(null);
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState("Preparando");
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [engine, setEngine] = useState<EngineInfo | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [selected, setSelected] = useState(0);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [selecting, setSelecting] = useState<{ done: number; total: number; label: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const p = supportProblem();
    if (p) setNotice({ kind: "error", text: p });
    // ja comeca a baixar os modelos em segundo plano
    if (!p) getAnalyzer().ready.then(setEngine).catch(() => {});
  }, []);

  /** Garante que so uma tarefa usa o video por vez. */
  const withVideo = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const run = videoLock.current.catch(() => {}).then(fn);
    videoLock.current = run.catch(() => {});
    return run;
  }, []);

  const reset = useCallback(() => {
    scanAbort.current?.abort();
    selAbort.current?.abort();
    srcRef.current?.dispose();
    srcRef.current = null;
    scanRef.current = null;
    setPeople([]);
    setPicks([]);
    setSelecting(null);
    setProgress(null);
    setPhase("inicio");
  }, []);

  const choosePerson = useCallback(
    async (index: number, list: Person[]) => {
      const src = srcRef.current, scan = scanRef.current;
      if (!src || !scan || !list[index]) return;
      selAbort.current?.abort();
      const ctrl = new AbortController();
      selAbort.current = ctrl;
      setSelected(index);
      setPicks([]);
      setSelecting({ done: 0, total: 0, label: "Escolhendo as melhores fotos" });
      const { client } = getAnalyzer();
      try {
        const result = await withVideo(async () => {
          if (ctrl.signal.aborted) throw new DOMException("cancelado", "AbortError");
          const res = await selectBest(
            src, client, scan, list[index], settings.count, settings.minGap, fpsRef.current,
            (p) => !ctrl.signal.aborted && setSelecting({ ...p, label: "Escolhendo as melhores fotos" }),
            ctrl.signal
          );
          if (!ctrl.signal.aborted) setSelecting({ done: res.length, total: res.length, label: "Preparando as imagens" });
          await makePreviews(src, res);
          return res;
        });
        if (!ctrl.signal.aborted) {
          setPicks(result);
          setSelecting(null);
        }
      } catch (e) {
        if ((e as DOMException)?.name === "AbortError") return;
        setSelecting(null);
        setNotice({ kind: "error", text: "Algo deu errado ao escolher as fotos. Recarregue a página e tente de novo." });
      }
    },
    [settings.count, settings.minGap, withVideo]
  );

  const startScan = useCallback(
    async (file: File, saved: ScanData | null) => {
      setResume(null);
      setNotice(null);
      const video = videoRef.current!;
      let src: VideoSource;
      try {
        srcRef.current?.dispose();
        src = await VideoSource.open(file, video);
        srcRef.current = src;
      } catch {
        setNotice({
          kind: "error",
          text: "Formato de vídeo não suportado. Converta para MP4 (H.264) e tente de novo. Um conversor gratuito como o HandBrake resolve.",
        });
        return;
      }

      setFileName(file.name);
      setPhase("varredura");
      setProgress(null);
      setStatus("Preparando a análise");
      window.scrollTo({ top: 0, behavior: "smooth" });

      const { client, ready } = getAnalyzer((m) => setStatus(m));
      try {
        setEngine(await ready);
      } catch {
        setPhase("inicio");
        setNotice({ kind: "error", text: "Não foi possível carregar os modelos de análise. Confira sua internet e recarregue a página." });
        return;
      }

      const interval = saved?.interval ?? settings.interval;
      const totalFrames = Math.floor(Math.max(0, src.duration - 0.05) / interval) + 1;
      const data: ScanData = saved ?? {
        key: fileKey(file),
        fileName: file.name,
        interval,
        duration: src.duration,
        width: src.width,
        height: src.height,
        nextIndex: 0,
        totalFrames,
        frames: [],
        done: false,
        updatedAt: Date.now(),
      };
      scanRef.current = data;

      const ctrl = new AbortController();
      scanAbort.current = ctrl;
      try {
        if (!data.done) {
          setStatus("Procurando rostos no vídeo");
          const pv = previewRef.current;
          if (pv) {
            pv.width = 960;
            pv.height = Math.round((src.height / src.width) * 960);
          }
          await withVideo(() => runScan(src, client, data, setProgress, ctrl.signal, pv));
        }
      } catch {
        if (!ctrl.signal.aborted) {
          setPhase("inicio");
          setNotice({ kind: "error", text: "A leitura do vídeo parou no meio. Escolha o vídeo de novo para continuar de onde parou." });
          return;
        }
      }
      if (ctrl.signal.aborted) return;

      setStatus("Separando as pessoas");
      await new Promise((r) => setTimeout(r, 30));
      const found = groupPeople(data.frames);
      if (!found.length) {
        reset();
        setNotice({
          kind: "error",
          text: "Não encontramos rostos com clareza nesse vídeo. Tente um intervalo de análise menor ou um vídeo com o pregador mais próximo da câmera.",
        });
        return;
      }
      setStatus("Montando as miniaturas");
      await withVideo(async () => {
        await makeThumbs(src, found);
        fpsRef.current = await src.estimateFps();
      });
      setPeople(found);
      setPhase("resultado");
      window.scrollTo({ top: 0 });
      choosePerson(0, found);
    },
    [settings.interval, withVideo, reset, choosePerson]
  );

  const onFile = useCallback(
    async (file: File) => {
      setNotice(null);
      if (!file.type.startsWith("video/") && !VIDEO_EXT.test(file.name)) {
        setNotice({ kind: "error", text: "Esse arquivo não é um vídeo. Escolha um arquivo MP4, MOV ou WebM." });
        return;
      }
      const saved = await loadScan(fileKey(file));
      if (saved && saved.frames.length > 0) {
        setResume({ file, saved });
        return;
      }
      startScan(file, null);
    },
    [startScan]
  );

  const cancelScan = () => {
    scanAbort.current?.abort();
    srcRef.current?.dispose();
    srcRef.current = null;
    setPhase("inicio");
    setNotice({
      kind: "info",
      text: "Análise pausada. O progresso ficou salvo: escolha o mesmo vídeo de novo para continuar de onde parou.",
    });
  };

  const baseName = (p: Pick) => `pregador_${timeLabel(p.t)}`;

  const onFull = (p: Pick) =>
    withVideo(async () => {
      setBusy("full");
      try { download(await fullPng(srcRef.current!, p), `${baseName(p)}.png`); } finally { setBusy(null); }
    });

  const onCrop = (p: Pick) =>
    withVideo(async () => {
      setBusy("crop");
      try { download(await cropPng(srcRef.current!, p), `${baseName(p)}_4x5.png`); } finally { setBusy(null); }
    });

  const onZip = () =>
    withVideo(async () => {
      setBusy("zip");
      try {
        const zip = new JSZip();
        const full = zip.folder("frame-inteiro")!;
        const crop = zip.folder("recorte-4x5")!;
        for (const p of picks) {
          full.file(`${baseName(p)}.png`, await fullPng(srcRef.current!, p));
          crop.file(`${baseName(p)}_4x5.png`, await cropPng(srcRef.current!, p));
        }
        const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
        const stem = fileName.replace(/\.[^.]+$/, "") || "pregacao";
        download(blob, `frames_${stem}.zip`);
      } catch {
        setNotice({ kind: "error", text: "Não deu para montar o zip. Baixe as fotos uma a uma ou tente de novo." });
      } finally {
        setBusy(null);
      }
    });

  const pct = progress ? (progress.done / progress.total) * 100 : 0;
  const durMin = srcRef.current ? srcRef.current.duration / 60 : 0;

  return (
    <div className="relative min-h-screen overflow-x-clip">
      {/* luz quente ao fundo */}
      <div className="flare -left-40 top-[-120px] h-[520px] w-[260px] bg-orange/70" />
      <div className="flare right-[-200px] top-[30%] h-[420px] w-[420px] bg-ember/40" />

      <header className="sticky top-0 z-30 px-4 pt-4 sm:px-8">
        <nav className="mx-auto flex max-w-[1240px] items-center justify-between rounded-full border border-line bg-bg/70 py-2.5 pl-5 pr-2.5 backdrop-blur-xl">
          <button onClick={reset} className="cursor-pointer" aria-label="Voltar ao início">
            <Logo />
          </button>
          <div className="flex items-center gap-1.5">
            <a href="#como-funciona" onClick={() => phase !== "inicio" && reset()} className="hidden rounded-full px-4 py-2 text-sm text-muted transition hover:text-cream sm:block">
              Como funciona
            </a>
            <span className="hidden items-center gap-1.5 rounded-full bg-surface-2 px-4 py-2 text-sm text-muted md:flex">
              <Icon name="lock" className="h-3.5 w-3.5 text-amber" /> 100% no navegador
            </span>
          </div>
        </nav>
      </header>

      <main className="relative">
        {phase === "inicio" && (
          <Home settings={settings} onSettings={setSettings} onFile={onFile} notice={notice} />
        )}

        {/* VARREDURA (o video fica sempre montado aqui para nao perder o arquivo) */}
        <section className={phase === "varredura" ? "mx-auto max-w-[1240px] px-4 pb-24 pt-10 sm:px-8" : "hidden"}>
          <div className="grid items-center gap-6 lg:grid-cols-[1.2fr_1fr]">
            <Card className="grain overflow-hidden p-3">
              <div className="grid aspect-video w-full place-items-center overflow-hidden rounded-[22px] bg-black">
                <canvas ref={previewRef} className="max-h-full max-w-full" aria-label="Frame sendo analisado" />
              </div>
            </Card>
            <div className="flex flex-col justify-center">
              <p className="text-sm font-semibold uppercase tracking-[0.36em] text-muted">Analisando</p>
              <h1 className="mt-2 font-display text-[clamp(56px,7vw,96px)] uppercase leading-[0.88]">
                <span className="text-gradient">{Math.floor(pct)}%</span>
              </h1>
              <p className="mt-3 truncate text-muted">{fileName}</p>

              <div className="mt-8 h-3 overflow-hidden rounded-full bg-surface-3">
                <div className="bg-ember-gradient relative h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.max(2, pct)}%` }}>
                  <div className="shimmer absolute inset-0 rounded-full" />
                </div>
              </div>
              <p className="mt-3 text-sm text-gold" aria-live="polite">{status}</p>

              <div className="mt-8 grid grid-cols-3 gap-3">
                <Stat label="Minutos analisados" value={`${Math.floor((progress?.videoSeconds ?? 0) / 60)}`} sub={`de ${Math.ceil(durMin)} min`} />
                <Stat label="Tempo restante" value={progress?.etaSeconds != null ? etaLabel(progress.etaSeconds).replace("cerca de ", "") : "..."} sub="estimado" />
                <Stat label="Rostos" value={`${progress?.facesFound ?? 0}`} sub="encontrados" />
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Button variant="ghost" onClick={cancelScan}>
                  <Icon name="close" /> Cancelar
                </Button>
                <span className="text-xs text-faint">
                  O progresso é salvo sozinho. {engine && `Processando com ${engine.landmarker === "GPU" ? "placa de vídeo" : "processador"}.`}
                </span>
              </div>
            </div>
          </div>
        </section>

        {phase === "resultado" && (
          <>
            {notice && (
              <div className="mx-auto mt-6 max-w-[1240px] px-4 sm:px-8">
                <div role="alert" className="rounded-2xl border border-danger/40 bg-danger/10 px-5 py-4 text-sm text-[#ffd2c4]">{notice.text}</div>
              </div>
            )}
            <Results
              fileName={fileName}
              people={people}
              selected={selected}
              onSelect={(i) => i !== selected && choosePerson(i, people)}
              picks={picks}
              selecting={selecting}
              busy={busy}
              onFull={onFull}
              onCrop={onCrop}
              onZip={onZip}
              onRestart={reset}
            />
          </>
        )}
      </main>

      {/* O video fica sempre oculto: com ele visivel, o Chrome as vezes entrega
          o quadro anterior logo depois de um seek. */}
      <video ref={videoRef} className="hidden" muted playsInline aria-hidden />

      <footer className="relative border-t border-line px-4 py-10 text-center text-sm text-faint sm:px-8">
        Frame do Pregador. Tudo roda no seu navegador: o vídeo não é enviado para lugar nenhum.
      </footer>

      {/* RETOMAR */}
      {resume && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="retomar-titulo">
          <Card className="rise w-full max-w-[480px] p-8">
            <span className="bg-ember-gradient grid h-12 w-12 place-items-center rounded-full text-[#1f0f05]">
              <Icon name="spark" className="h-6 w-6" />
            </span>
            {resume.saved.done ? (
              <>
                <h2 id="retomar-titulo" className="mt-5 font-display text-4xl uppercase leading-none">Já analisado</h2>
                <p className="mt-3 leading-relaxed text-muted">
                  Esse vídeo já foi analisado antes neste computador. Quer usar o resultado salvo ou analisar de novo?
                </p>
              </>
            ) : (
              <>
                <h2 id="retomar-titulo" className="mt-5 font-display text-4xl uppercase leading-none">Continuar?</h2>
                <p className="mt-3 leading-relaxed text-muted">
                  Você já começou a analisar esse vídeo ({Math.floor((resume.saved.nextIndex / resume.saved.totalFrames) * 100)}% feito).
                  Quer continuar de onde parou?
                </p>
              </>
            )}
            <div className="mt-7 flex flex-wrap gap-3">
              <Button onClick={() => startScan(resume.file, resume.saved)}>
                {resume.saved.done ? "Usar resultado salvo" : "Continuar de onde parou"}
              </Button>
              <Button
                variant="ghost"
                onClick={async () => {
                  const f = resume.file;
                  await deleteScan(resume.saved.key);
                  startScan(f, null);
                }}
              >
                Começar do zero
              </Button>
            </div>
            <button onClick={() => setResume(null)} className="mt-5 cursor-pointer text-sm text-faint hover:text-cream">
              Voltar
            </button>
          </Card>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-[22px] border border-line bg-surface p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">{label}</p>
      <p className="mt-2 font-display text-[28px] leading-none text-cream">{value}</p>
      <p className="mt-1 text-xs text-muted">{sub}</p>
    </div>
  );
}
