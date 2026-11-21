"use client";
import { useRef, useState } from "react";
import type { ScanSettings } from "@/lib/types";
import { Card, Icon, Pill } from "./ui";

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

  return (
    <>
      {/* HERO */}
      <section className="relative mx-auto grid max-w-[1240px] gap-10 px-4 pb-16 pt-10 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:pt-16">
        <div className="rise flex flex-col justify-center">
          <Pill className="w-fit">
            <Icon name="lock" className="h-3.5 w-3.5 text-amber" />
            O vídeo não sai do seu computador
          </Pill>
          <p className="mt-8 text-sm font-semibold uppercase tracking-[0.42em] text-muted">Frame do</p>
          <h1 className="font-display text-[clamp(72px,11vw,156px)] uppercase leading-[0.86] tracking-[-0.01em]">
            <span className="text-gradient">Pregador</span>
          </h1>
          <p className="mt-1 font-script text-[clamp(34px,4.2vw,54px)] leading-none text-gold">a melhor pose, sem esforço</p>
          <p className="mt-8 max-w-[520px] text-lg leading-relaxed text-muted">
            Escolha o vídeo da pregação. O site encontra o pregador e entrega os frames com a melhor pose,
            prontos para usar na arte de divulgação.
          </p>
          <div className="mt-8 flex flex-wrap gap-2 text-sm text-muted">
            <Pill>Frame inteiro em PNG</Pill>
            <Pill>Recorte vertical 4:5</Pill>
            <Pill>Baixar tudo em .zip</Pill>
          </div>
        </div>

        {/* DROPZONE */}
        <div className="rise [animation-delay:120ms]">
          <Card className="grain overflow-hidden p-3">
            <div className="flare -left-24 top-10 h-72 w-40 bg-orange" />
            <div className="flare -right-10 -top-16 h-56 w-56 bg-amber/60" />
            <button
              type="button"
              onClick={() => input.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files); }}
              className={`relative flex min-h-[340px] w-full cursor-pointer flex-col items-center justify-center rounded-[22px] border-2 border-dashed px-6 py-12 text-center transition ${
                over ? "border-amber bg-amber/10" : "border-line-strong bg-surface-2/60 hover:border-amber/60 hover:bg-surface-2"
              }`}
            >
              <span className="bg-ember-gradient grid h-16 w-16 place-items-center rounded-full text-[#1f0f05] shadow-[0_12px_40px_-8px_rgba(232,116,44,0.8)]">
                <Icon name="upload" className="h-7 w-7" />
              </span>
              <span className="mt-6 font-display text-[34px] uppercase leading-none tracking-wide">Solte o vídeo aqui</span>
              <span className="mt-3 text-[15px] text-muted">
                ou <span className="font-semibold text-gold underline decoration-amber/50 underline-offset-4">clique para escolher</span> no computador
              </span>
              <span className="mt-6 text-xs text-faint">MP4, MOV ou WebM. Vídeos longos funcionam.</span>
            </button>
            <input
              ref={input}
              type="file"
              accept="video/*,.mp4,.mov,.m4v,.webm,.mkv"
              className="hidden"
              onChange={(e) => { pick(e.target.files); e.target.value = ""; }}
            />
            <p className="relative px-4 pb-2 pt-4 text-[13px] leading-relaxed text-muted">
              <strong className="text-cream">Precisa ter o vídeo baixado.</strong> Links do YouTube não funcionam aqui.
              Baixe a pregação no computador e depois escolha o arquivo.
            </p>
          </Card>

          {notice && (
            <div
              role={notice.kind === "error" ? "alert" : "status"}
              className={`mt-4 rounded-2xl border px-5 py-4 text-sm leading-relaxed ${
                notice.kind === "error" ? "border-danger/40 bg-danger/10 text-[#ffd2c4]" : "border-amber/30 bg-amber/10 text-gold"
              }`}
            >
              {notice.text}
            </div>
          )}

          {/* AJUSTES */}
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Card className="p-5 sm:col-span-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold">Intervalo de análise</span>
                <span className="text-xs text-faint">menor = mais preciso, mais demorado</span>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-1.5 rounded-full bg-surface-2 p-1.5" role="radiogroup" aria-label="Intervalo de análise">
                {INTERVALS.map((v) => (
                  <button
                    key={v}
                    role="radio"
                    aria-checked={settings.interval === v}
                    onClick={() => onSettings({ ...settings, interval: v })}
                    className={`h-10 cursor-pointer rounded-full text-sm font-semibold transition ${
                      settings.interval === v ? "bg-cream text-[#1f0f05]" : "text-muted hover:text-cream"
                    }`}
                  >
                    {String(v).replace(".", ",")} s
                  </button>
                ))}
              </div>
            </Card>
            <Slider
              className="sm:col-span-3 lg:col-span-3 xl:col-span-3"
              label="Quantidade de fotos"
              value={settings.count}
              min={4}
              max={30}
              suffix=" fotos"
              onChange={(count) => onSettings({ ...settings, count })}
            />
            <Slider
              className="sm:col-span-3"
              label="Distância mínima entre fotos"
              value={settings.minGap}
              min={2}
              max={30}
              suffix=" s"
              onChange={(minGap) => onSettings({ ...settings, minGap })}
            />
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section id="como-funciona" className="mx-auto max-w-[1240px] px-4 pb-24 sm:px-8">
        <div className="rounded-[36px] border border-line bg-surface px-6 py-12 sm:px-12 sm:py-16">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <h2 className="font-display text-[clamp(44px,6vw,84px)] uppercase leading-[0.9]">
              Como <span className="text-gradient">funciona</span>
            </h2>
            <p className="max-w-[380px] text-muted">
              Tudo acontece no seu navegador. Nada é enviado para servidor nenhum, por isso é rápido e privado.
            </p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {[
              ["01", "Escolha o vídeo", "Arraste o arquivo da pregação. Pode ser um culto inteiro."],
              ["02", "A gente varre tudo", "O site olha o vídeo inteiro, encontra os rostos e descobre quem é o pregador."],
              ["03", "Baixe as melhores", "Fotos nítidas, de frente e de olhos abertos, em PNG e já no recorte 4:5."],
            ].map(([n, t, d]) => (
              <div key={n} className="rounded-[26px] border border-line bg-surface-2 p-7">
                <span className="font-display text-6xl leading-none text-gradient">{n}</span>
                <h3 className="mt-6 text-xl font-semibold">{t}</h3>
                <p className="mt-2 leading-relaxed text-muted">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

function Slider({
  label, value, min, max, suffix, onChange, className = "",
}: {
  label: string; value: number; min: number; max: number; suffix: string;
  onChange: (v: number) => void; className?: string;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <Card className={`p-5 ${className}`}>
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-semibold">{label}</label>
        <span className="font-display text-2xl leading-none text-gold">
          {value}
          <span className="font-sans text-sm text-muted">{suffix}</span>
        </span>
      </div>
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
      <div className="mt-2 flex justify-between text-xs text-faint">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </Card>
  );
}
