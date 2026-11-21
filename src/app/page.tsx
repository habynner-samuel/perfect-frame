"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { Home } from "@/components/Home";
import { Results } from "@/components/Results";
import { Button, Icon, Wordmark } from "@/components/ui";
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
    <div className="min-h-screen overflow-x-clip">
      {/* Barra de navegacao reta de ponta a ponta, como a da Apple; marca no centro */}
      <header className="sticky top-0 z-30 border-b border-line bg-abyss/90 backdrop-blur-md">
        <nav className="mx-auto grid h-12 max-w-[1180px] grid-cols-[1fr_auto_1fr] items-center px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <a
              href="#como-funciona"
              onClick={() => phase !== "inicio" && reset()}
              className="eyebrow hidden text-[12px] text-mist transition-colors hover:text-white sm:block"
            >
              Como funciona
            </a>
          </div>
          <button onClick={reset} className="cursor-pointer" aria-label="Voltar ao início">
            <Wordmark />
          </button>
          <div className="flex justify-end">
            <span className="eyebrow hidden text-[12px] text-mist md:block">100% no navegador</span>
          </div>
        </nav>
      </header>

      <main>
        {phase === "inicio" && (
          <Home settings={settings} onSettings={setSettings} onFile={onFile} notice={notice} />
        )}

        {/* VARREDURA */}
        <section className={phase === "varredura" ? "depth px-4 pb-24 pt-10 sm:px-6" : "hidden"}>
          <div className="mx-auto max-w-[980px] text-center">
            <p className="eyebrow text-mist">Analisando o vídeo</p>
            <h1 className="mt-3 font-display text-[clamp(80px,10vw,128px)] font-extrabold leading-[0.85]">
              {Math.floor(pct)}%
            </h1>
            <p className="mt-3 truncate text-mist">{fileName}</p>
          </div>

          <div className="mx-auto mt-8 max-w-[760px]">
            <div className="grid aspect-video w-full place-items-center overflow-hidden rounded-[4px] bg-abyss">
              <canvas ref={previewRef} className="max-h-full max-w-full" aria-label="Frame sendo analisado" />
            </div>
            <div className="mt-6 h-1 bg-line-strong">
              <div className="h-full bg-cyan transition-[width] duration-300" style={{ width: `${Math.max(1, pct)}%` }} />
            </div>
            <p className="mt-3 text-[15px] text-cyan" aria-live="polite">{status}</p>

            <div className="mt-10 grid grid-cols-3 border-y border-line">
              <Stat label="Minutos analisados" value={`${Math.floor((progress?.videoSeconds ?? 0) / 60)}`} sub={`de ${Math.ceil(durMin)} min`} />
              <Stat
                label="Tempo restante"
                value={progress?.etaSeconds != null ? etaLabel(progress.etaSeconds).replace("cerca de ", "") : "..."}
                sub="estimado"
                divider
              />
              <Stat label="Rostos" value={`${progress?.facesFound ?? 0}`} sub="encontrados" divider />
            </div>

            <div className="mt-10 flex flex-col items-center gap-4">
              <Button variant="outline" onClick={cancelScan}>
                <Icon name="close" /> Cancelar
              </Button>
              <span className="text-[14px] text-faint">
                O progresso é salvo sozinho. {engine && `Processando com ${engine.landmarker === "GPU" ? "placa de vídeo" : "processador"}.`}
              </span>
            </div>
          </div>
        </section>

        {phase === "resultado" && (
          <>
            {notice && (
              <div className="mx-auto mt-6 max-w-[1180px] px-4 sm:px-6">
                <div role="alert" className="border-l-2 border-danger bg-danger/10 px-5 py-4 text-[15px]">{notice.text}</div>
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

      <footer className="border-t border-line bg-abyss px-4 py-12 text-center sm:px-6">
        <Wordmark className="text-[17px]" />
        <p className="mt-3 text-[14px] text-faint">Tudo roda no seu navegador. O vídeo não é enviado para lugar nenhum.</p>
      </footer>

      {/* RETOMAR */}
      {resume && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-abyss/85 p-4" role="dialog" aria-modal="true" aria-labelledby="retomar-titulo">
          <div className="rise w-full max-w-[520px] rounded-[4px] border border-line-strong bg-panel p-8 sm:p-10">
            <p className="eyebrow text-cyan">{resume.saved.done ? "Vídeo conhecido" : "Análise pela metade"}</p>
            {resume.saved.done ? (
              <>
                <h2 id="retomar-titulo" className="mt-3 font-display text-[44px] font-extrabold uppercase leading-none">Já analisado</h2>
                <p className="mt-4 text-mist">
                  Esse vídeo já foi analisado neste computador. Quer usar o resultado salvo ou analisar de novo?
                </p>
              </>
            ) : (
              <>
                <h2 id="retomar-titulo" className="mt-3 font-display text-[44px] font-extrabold uppercase leading-none">Continuar?</h2>
                <p className="mt-4 text-mist">
                  Você já começou a analisar esse vídeo ({Math.floor((resume.saved.nextIndex / resume.saved.totalFrames) * 100)}% feito).
                  Quer continuar de onde parou?
                </p>
              </>
            )}
            <div className="mt-8 flex flex-wrap gap-3">
              <Button onClick={() => startScan(resume.file, resume.saved)}>
                {resume.saved.done ? "Usar resultado salvo" : "Continuar"}
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  const f = resume.file;
                  await deleteScan(resume.saved.key);
                  startScan(f, null);
                }}
              >
                Começar do zero
              </Button>
            </div>
            <button onClick={() => setResume(null)} className="mt-6 cursor-pointer text-[15px] text-cyan hover:underline underline-offset-4">
              Voltar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, divider = false }: { label: string; value: string; sub: string; divider?: boolean }) {
  return (
    <div className={`px-3 py-6 text-center sm:px-6 ${divider ? "border-l border-line" : ""}`}>
      <p className="eyebrow text-[11px] text-mist">{label}</p>
      <p className="mt-3 font-display text-[clamp(30px,4vw,44px)] font-bold leading-none">{value}</p>
      <p className="mt-1 text-[14px] text-faint">{sub}</p>
    </div>
  );
}
