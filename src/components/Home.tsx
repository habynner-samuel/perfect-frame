"use client";
import { useRef, useState } from "react";
import type { ScanSettings } from "@/lib/types";
import { Button, Icon, Panel, TextLink } from "./ui";

const INTERVALS = [0.5, 1, 2, 3];

export function Home({
  settings,
  onSettings,
  onFile,
  notice,
}: {
  settings: ScanSettings;
  onSettings: (s: ScanSettings) => void;
  onFile: (f: File) => void;
  notice: { kind: "error" | "info"; text: string } | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const pick = (files: FileList | null) => {
    const f = files?.[0];
    if (f) onFile(f);
  };
  const open = () => input.current?.click();

  return (
    <>
      {/* HERO: titulo centralizado, como a Apple */}
      <section className="depth px-4 pb-24 pt-20 text-center sm:px-6 sm:pt-28">
        <div className="rise mx-auto max-w-[980px]">
          <p className="eyebrow text-mist">Fotos de pregação, direto do vídeo</p>
          <h1 className="mt-5 font-display font-extrabold uppercase leading-[0.86] tracking-[-0.005em]">
            <span className="block text-[clamp(34px,5vw,60px)] font-semibold tracking-[0.18em] text-mist">Frame do</span>
            <span className="block text-[clamp(84px,15vw,196px)]">Pregador</span>
          </h1>
          <p className="mx-auto mt-6 max-w-[620px] text-[19px] leading-[1.5] text-mist sm:text-[21px]">
            Escolha o vídeo do culto. O site encontra o pregador e entrega os frames com a melhor pose,
            prontos para a arte de divulgação.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-x-6 gap-y-4">
            <Button onClick={open}>
              <Icon name="upload" /> Escolher vídeo
            </Button>
            <TextLink href="#como-funciona">Como funciona</TextLink>
          </div>
        </div>

        {/* AREA DO ARQUIVO */}
        <div className="rise mx-auto mt-16 max-w-[980px] text-left [animation-delay:100ms]">
          <button
            type="button"
            onClick={open}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files); }}
            className={`flex w-full cursor-pointer flex-col items-center justify-center rounded-[4px] border px-6 py-14 text-center transition-colors duration-200 ${
              over ? "border-cyan bg-panel-2" : "border-line-strong bg-panel hover:border-white/60"
            }`}
          >
            <span className="grid h-12 w-12 place-items-center border border-white/70 text-white">
              <Icon name="upload" className="h-5 w-5" />
            </span>
            <span className="mt-5 font-display text-[30px] font-bold uppercase leading-none tracking-[0.04em]">
              Solte o vídeo aqui
            </span>
            <span className="mt-3 text-mist">ou clique para escolher no computador. MP4, MOV ou WebM.</span>
          </button>
          <input
            ref={input}
            type="file"
            accept="video/*,.mp4,.mov,.m4v,.webm,.mkv"
            className="hidden"
            onChange={(e) => { pick(e.target.files); e.target.value = ""; }}
          />
          <p className="mt-4 text-center text-[15px] text-mist">
            <strong className="font-semibold text-white">Precisa ter o vídeo baixado.</strong> Links do YouTube não
            funcionam aqui: baixe a pregação no computador e escolha o arquivo.
          </p>

          {notice && (
            <div
              role={notice.kind === "error" ? "alert" : "status"}
              className={`mt-6 border-l-2 px-5 py-4 text-[15px] ${
                notice.kind === "error" ? "border-danger bg-danger/10 text-white" : "border-cyan bg-cyan/10 text-white"
              }`}
            >
              {notice.text}
            </div>
          )}

          {/* AJUSTES em grade de 3, espacamento de 12 px */}
          <div className="mt-12 grid gap-3 md:grid-cols-3">
            <Panel className="p-6">
              <p className="eyebrow text-mist">Intervalo de análise</p>
              <div className="mt-5 grid grid-cols-4 border border-line-strong" role="radiogroup" aria-label="Intervalo de análise">
                {INTERVALS.map((v, i) => (
                  <button
                    key={v}
                    role="radio"
                    aria-checked={settings.interval === v}
                    onClick={() => onSettings({ ...settings, interval: v })}
                    className={`h-11 cursor-pointer font-display text-[17px] font-semibold transition-colors duration-200 ${
                      i ? "border-l border-line-strong" : ""
                    } ${settings.interval === v ? "bg-white text-abyss" : "text-mist hover:text-white"}`}
                  >
                    {String(v).replace(".", ",")} s
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[13px] text-faint">Menor fica mais preciso e demora mais.</p>
            </Panel>
            <Slider
              label="Quantidade de fotos"
              value={settings.count}
              min={4}
              max={30}
              unit="fotos"
              onChange={(count) => onSettings({ ...settings, count })}
            />
            <Slider
              label="Distância entre fotos"
              value={settings.minGap}
              min={2}
              max={30}
              unit="segundos"
              onChange={(minGap) => onSettings({ ...settings, minGap })}
            />
          </div>
        </div>
      </section>

      {/* FAIXA DE FATOS, como os selos da referencia */}
      <section className="border-y border-line bg-abyss">
        <div className="mx-auto grid max-w-[980px] grid-cols-2 md:grid-cols-4">
          {[
            ["100%", "no seu navegador"],
            ["PNG", "frame inteiro"],
            ["4:5", "recorte vertical"],
            [".ZIP", "todas de uma vez"],
          ].map(([big, small], i) => (
            <div key={big} className={`px-6 py-8 text-center ${i ? "md:border-l md:border-line" : ""} ${i % 2 ? "border-l border-line md:border-l" : ""} ${i >= 2 ? "border-t border-line md:border-t-0" : ""}`}>
              <p className="font-display text-[40px] font-bold leading-none">{big}</p>
              <p className="eyebrow mt-2 text-[11px] text-mist">{small}</p>
            </div>
          ))}
        </div>
      </section>

      {/* COMO FUNCIONA, com corte diagonal */}
      <section id="como-funciona" className="slant-top -mt-px bg-ocean px-4 pb-24 pt-32 sm:px-6">
        <div className="mx-auto max-w-[980px]">
          <p className="eyebrow text-center text-white/80">Pronto para a arte de domingo?</p>
          <h2 className="mt-4 text-center font-display text-[clamp(44px,6vw,72px)] font-extrabold uppercase leading-[0.92]">
            Em três passos, <span className="text-sunrise">sem complicação</span>
          </h2>
          <div className="mt-14 grid gap-3 md:grid-cols-3">
            {[
              ["01", "Escolha o vídeo", "Arraste o arquivo da pregação. Pode ser o culto inteiro, de uma ou duas horas."],
              ["02", "O site varre tudo", "Ele olha o vídeo do começo ao fim, separa as pessoas e descobre quem é o pregador."],
              ["03", "Baixe as melhores", "Fotos nítidas, de frente e de olhos abertos. Em PNG e já no recorte 4:5."],
            ].map(([n, t, d]) => (
              <div key={n} className="rounded-[4px] bg-navy p-7">
                <span className="font-display text-[64px] font-extrabold leading-none text-cyan">{n}</span>
                <h3 className="mt-6 font-display text-[26px] font-bold uppercase leading-tight tracking-[0.02em]">{t}</h3>
                <p className="mt-2 text-mist">{d}</p>
              </div>
            ))}
          </div>
          <div className="mt-14 text-center">
            <Button variant="outline" onClick={open}>
              Escolher vídeo
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}

function Slider({
  label, value, min, max, unit, onChange,
}: {
  label: string; value: number; min: number; max: number; unit: string; onChange: (v: number) => void;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <Panel className="p-6">
      <div className="flex items-baseline justify-between gap-3">
        <label className="eyebrow text-mist">{label}</label>
      </div>
      <p className="mt-3 font-display text-[40px] font-bold leading-none">
        {value} <span className="text-[17px] font-medium uppercase tracking-[0.12em] text-mist">{unit}</span>
      </p>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ["--fill" as string]: `${fill}%` }}
        className="mt-5"
      />
      <div className="mt-2 flex justify-between text-[13px] text-faint">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </Panel>
  );
}
