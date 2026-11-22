"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { ImportView, type ImportHandle } from "@/components/Home";
import { ResultsView } from "@/components/Results";
import { Accent, Shell, StepHero } from "@/components/Shell";
import { Button } from "@/components/ui";
import { getAnalyzer } from "@/lib/analyzer-client";
import { groupPeople } from "@/lib/people";
import {
  cropPng, download, fullPng, makePreviews, makeThumbs, runScan, selectBest, timeLabel,
  type ScanProgress,
} from "@/lib/pipeline";
import { deleteScan, listScans, loadScan, type ScanSummary } from "@/lib/storage";
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
  const importRef = useRef<ImportHandle>(null);

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
  const [recents, setRecents] = useState<ScanSummary[]>([]);
  const refreshRecents = useCallback(() => { listScans().then(setRecents); }, []);

  useEffect(() => {
    const p = supportProblem();
    if (p) setNotice({ kind: "error", text: p });
    // ja comeca a baixar os modelos em segundo plano
    if (!p) getAnalyzer().ready.then(setEngine).catch(() => {});
    refreshRecents();
  }, [refreshRecents]);

  /** Garante que so uma tarefa usa o video por vez. */
  const withVideo = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const run = videoLock.current.catch(() => {}).then(fn);
    videoLock.current = run.catch(() => {});
    return run;
  }, []);

  /** tempos das fotos ja mostradas por pessoa, para "buscar outras" nao repetir */
  const shownRef = useRef(new Map<number, number[]>());

  const reset = useCallback(() => {
    shownRef.current.clear();
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
    refreshRecents();
  }, [refreshRecents]);

  const choosePerson = useCallback(
    async (index: number, list: Person[], more = false) => {
      const src = srcRef.current, scan = scanRef.current;
      if (!src || !scan || !list[index]) return;
      const exclude = more ? shownRef.current.get(index) ?? [] : [];
      setNotice(null);
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
          const label = more ? "Procurando outras fotos" : "Escolhendo as melhores fotos";
          const res = await selectBest(
            src, client, scan, list[index], settings.count, settings.minGap, fpsRef.current,
            (p) => !ctrl.signal.aborted && setSelecting({ ...p, label }),
            ctrl.signal,
            exclude
          );
          if (!ctrl.signal.aborted) setSelecting({ done: res.length, total: res.length, label: "Preparando as imagens" });
          await makePreviews(src, res);
          return res;
        });
        if (!ctrl.signal.aborted) {
          shownRef.current.set(index, [...exclude, ...result.map((p) => p.t)]);
          setPicks(result);
          setSelecting(null);
          if (more && !result.length) {
            setNotice({
              kind: "info",
              text: "Não sobraram fotos diferentes dessa pessoa. Diminua a distância mínima ou refaça a seleção para ver as melhores de novo.",
            });
          }
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
      refreshRecents();
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

  const onRecent = (r: ScanSummary) => {
    reset();
    setNotice({
      kind: "info",
      text: `Para abrir "${r.fileName}", escolha o mesmo arquivo de novo. A análise salva ${r.done ? "abre na hora" : "continua de onde parou"}.`,
    });
    setTimeout(() => importRef.current?.openPicker(), 50);
  };

  const cancelScan = () => {
    scanAbort.current?.abort();
    srcRef.current?.dispose();
    srcRef.current = null;
    setPhase("inicio");
    refreshRecents();
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

  const etaText = progress?.etaSeconds != null ? etaLabel(progress.etaSeconds).replace("cerca de ", "") : "calculando";

  return (
    <>
      <Shell recents={recents} onRecent={onRecent} onHome={reset} showRecents={phase === "inicio"}>
        {phase === "inicio" && (
          <ImportView ref={importRef} onFile={onFile} notice={notice} settings={settings} onSettings={setSettings} />
        )}

        {/* ANALISE: fica montada para o canvas da previa existir durante a varredura */}
        <div className={phase === "varredura" ? "" : "hidden"}>
          <StepHero
            step={1}
            title={<>Analisando <Accent>o vídeo</Accent></>}
            subtitle={<>Pode deixar rodando. Faltam <strong className="font-semibold text-ink">{etaText}</strong>. O progresso é salvo sozinho.</>}
            actions={
              <Button variant="outline" onClick={cancelScan}>
                Pausar análise
              </Button>
            }
          />

          <div className="mt-10 flex flex-wrap items-end gap-x-10 gap-y-4">
            <p className="title text-[96px] tabular-nums text-ink" aria-live="polite">{Math.floor(pct)}%</p>
            <dl className="mb-3 grid grid-cols-3 gap-x-8 text-[14px]">
              <div>
                <dt className="text-ink-2">Minutos</dt>
                <dd className="text-[17px] font-semibold tabular-nums">{Math.floor((progress?.videoSeconds ?? 0) / 60)} de {Math.ceil(durMin)}</dd>
              </div>
              <div>
                <dt className="text-ink-2">Rostos</dt>
                <dd className="text-[17px] font-semibold tabular-nums">{progress?.facesFound ?? 0}</dd>
              </div>
              <div>
                <dt className="text-ink-2">Usando</dt>
                <dd className="text-[17px] font-semibold">{engine ? (engine.landmarker === "GPU" ? "Placa de vídeo" : "Processador") : "..."}</dd>
              </div>
            </dl>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-fill">
            <div className="h-full rounded-full bg-blue transition-[width] duration-300" style={{ width: `${Math.max(1, pct)}%` }} />
          </div>
          <p className="mt-2 truncate text-[13px] text-ink-2">{status} · {fileName}</p>

          <div className="mt-8 grid aspect-video w-full max-w-[880px] place-items-center overflow-hidden rounded-[18px] bg-ink shadow-[var(--shadow-card)]">
            <canvas ref={previewRef} className="max-h-full max-w-full" aria-label="Quadro sendo analisado" />
          </div>
        </div>

        {phase === "resultado" && (
          <>
            {notice && (
              <div role="alert" className="mt-6 rounded-[12px] bg-[#e8f2fd] px-5 py-4 text-[15px] text-ink">{notice.text}</div>
            )}
            <ResultsView
              people={people}
              selected={selected}
              onSelect={(i) => i !== selected && choosePerson(i, people)}
              picks={picks}
              selecting={selecting}
              busy={busy}
              onFull={onFull}
              onCrop={onCrop}
              onZip={onZip}
              onMore={() => choosePerson(selected, people, true)}
              onRedo={() => choosePerson(selected, people)}
              settings={settings}
              onSettings={setSettings}
            />
          </>
        )}
      </Shell>

      {/* O video fica sempre oculto: com ele visivel, o Chrome as vezes entrega
          o quadro anterior logo depois de um seek. */}
      <video ref={videoRef} className="hidden" muted playsInline aria-hidden />

      {/* RETOMAR: dialogo no estilo de alerta do macOS */}
      {resume && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="retomar-titulo">
          <div className="rise w-full max-w-[420px] rounded-[18px] bg-surface p-7 shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
            <h2 id="retomar-titulo" className="headline text-[24px]">
              {resume.saved.done ? "Esse vídeo já foi analisado." : "Continuar a análise?"}
            </h2>
            <p className="mt-2 text-[17px] text-ink-2">
              {resume.saved.done
                ? "Dá para abrir o resultado salvo na hora, ou analisar tudo de novo."
                : `A análise parou em ${Math.floor((resume.saved.nextIndex / resume.saved.totalFrames) * 100)}%. Dá para continuar de onde parou.`}
            </p>
            <div className="mt-7 flex flex-col gap-2">
              <Button onClick={() => startScan(resume.file, resume.saved)}>
                {resume.saved.done ? "Abrir resultado" : "Continuar"}
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
              <Button variant="quiet" onClick={() => setResume(null)}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

