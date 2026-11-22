"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { ImportView, SettingsPanel, type ImportHandle } from "@/components/Home";
import { ResultsView } from "@/components/Results";
import { InspectorSection, Shell, WorkHeader } from "@/components/Shell";
import { Button, Icon } from "@/components/ui";
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
    refreshRecents();
  }, [refreshRecents]);

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

  const selectedPerson = people[selected];

  const inspector =
    phase === "inicio" ? (
      <>
        <SettingsPanel settings={settings} onSettings={setSettings} />
        <InspectorSection title="Como funciona">
          <ol className="space-y-3 text-[14px] text-mist">
            {[
              "O site olha o vídeo inteiro e encontra os rostos.",
              "Separa as pessoas e marca quem mais aparece em destaque.",
              "Escolhe as fotos mais nítidas, de frente e de olhos abertos.",
            ].map((t, i) => (
              <li key={i} className="flex gap-3">
                <span className="tabular-nums text-cyan">{i + 1}</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
        </InspectorSection>
      </>
    ) : phase === "varredura" ? (
      <>
        <InspectorSection title="Progresso">
          <p className="font-display text-[56px] font-bold leading-none tabular-nums">{Math.floor(pct)}%</p>
          <dl className="space-y-2 text-[14px]">
            <Row label="Minutos analisados" value={`${Math.floor((progress?.videoSeconds ?? 0) / 60)} de ${Math.ceil(durMin)}`} />
            <Row label="Tempo restante" value={progress?.etaSeconds != null ? etaLabel(progress.etaSeconds).replace("cerca de ", "") : "calculando"} />
            <Row label="Rostos encontrados" value={`${progress?.facesFound ?? 0}`} />
            <Row label="Processamento" value={engine ? (engine.landmarker === "GPU" ? "Placa de vídeo" : "Processador") : "..."} />
          </dl>
        </InspectorSection>
        <section className="p-5">
          <Button variant="outline" className="w-full" onClick={cancelScan}>
            <Icon name="close" /> Pausar análise
          </Button>
          <p className="mt-3 text-[12px] text-faint">O progresso é salvo sozinho. Escolha o mesmo vídeo depois para continuar.</p>
        </section>
      </>
    ) : (
      <>
        {selectedPerson && (
          <InspectorSection title="Pessoa selecionada">
            <div className="flex items-center gap-3">
              {selectedPerson.thumb && <img src={selectedPerson.thumb} alt="" className="h-14 w-14 object-cover" />}
              <div>
                <p className="text-[15px] font-medium">{selected === 0 ? "Provável pregador" : `Pessoa ${selected + 1}`}</p>
                <p className="text-[13px] text-faint">Aparece em {Math.max(1, Math.round(selectedPerson.percent))}% do vídeo</p>
              </div>
            </div>
          </InspectorSection>
        )}
        <SettingsPanel settings={settings} onSettings={setSettings} showInterval={false} />
        <section className="border-b border-line p-5">
          <Button variant="outline" className="w-full" disabled={!!selecting} onClick={() => choosePerson(selected, people)}>
            <Icon name="refresh" /> Refazer seleção
          </Button>
          <p className="mt-3 text-[12px] text-faint">Usa a quantidade e a distância acima, sem analisar o vídeo de novo.</p>
        </section>
      </>
    );

  return (
    <>
      <Shell inspector={inspector} recents={recents} onRecent={onRecent} onHome={reset}>
        {phase === "inicio" && <ImportView ref={importRef} onFile={onFile} notice={notice} />}

        {/* ANALISE: fica montada para o canvas da previa existir durante a varredura */}
        <div className={phase === "varredura" ? "" : "hidden"}>
          <WorkHeader step={1} title="Analisando o vídeo" subtitle={fileName} />
          <div className="px-6 py-6 lg:px-8">
            <div className="grid aspect-video w-full max-w-[960px] place-items-center overflow-hidden rounded-[4px] border border-line bg-navy">
              <canvas ref={previewRef} className="max-h-full max-w-full" aria-label="Frame sendo analisado" />
            </div>
            <div className="mt-4 h-1 max-w-[960px] bg-line-strong">
              <div className="h-full bg-cyan transition-[width] duration-300" style={{ width: `${Math.max(1, pct)}%` }} />
            </div>
            <p className="mt-3 text-[14px] text-mist" aria-live="polite">{status}</p>
          </div>
        </div>

        {phase === "resultado" && (
          <>
            {notice && (
              <div role="alert" className="mx-6 mt-5 border-l-2 border-danger bg-danger/10 px-4 py-3 text-[14px] lg:mx-8">{notice.text}</div>
            )}
            <ResultsView
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
            />
          </>
        )}
      </Shell>

      {/* O video fica sempre oculto: com ele visivel, o Chrome as vezes entrega
          o quadro anterior logo depois de um seek. */}
      <video ref={videoRef} className="hidden" muted playsInline aria-hidden />

      {/* RETOMAR */}
      {resume && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-abyss/85 p-4" role="dialog" aria-modal="true" aria-labelledby="retomar-titulo">
          <div className="w-full max-w-[460px] rounded-[4px] border border-line-strong bg-navy p-6">
            <h2 id="retomar-titulo" className="text-[18px] font-semibold">
              {resume.saved.done ? "Esse vídeo já foi analisado" : "Continuar a análise?"}
            </h2>
            <p className="mt-2 text-[14px] text-mist">
              {resume.saved.done
                ? "Dá para abrir o resultado salvo na hora, ou analisar tudo de novo."
                : `A análise desse vídeo parou em ${Math.floor((resume.saved.nextIndex / resume.saved.totalFrames) * 100)}%. Dá para continuar de onde parou.`}
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button variant="quiet" onClick={() => setResume(null)}>Voltar</Button>
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
              <Button onClick={() => startScan(resume.file, resume.saved)}>
                {resume.saved.done ? "Abrir resultado" : "Continuar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-mist">{label}</dt>
      <dd className="tabular-nums text-white">{value}</dd>
    </div>
  );
}
