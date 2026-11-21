"use client";
import type { Person, Pick } from "@/lib/types";
import { clockLabel } from "@/lib/pipeline";
import { Button, Icon } from "./ui";

export function Results({
  fileName,
  people,
  selected,
  onSelect,
  picks,
  selecting,
  busy,
  onFull,
  onCrop,
  onZip,
  onRestart,
}: {
  fileName: string;
  people: Person[];
  selected: number;
  onSelect: (i: number) => void;
  picks: Pick[];
  selecting: { done: number; total: number; label: string } | null;
  busy: string | null;
  onFull: (p: Pick) => void;
  onCrop: (p: Pick) => void;
  onZip: () => void;
  onRestart: () => void;
}) {
  return (
    <>
      {/* PESSOAS */}
      <section className="depth px-4 pb-16 pt-14 sm:px-6">
        <div className="mx-auto max-w-[1180px]">
          <button onClick={onRestart} className="inline-flex cursor-pointer items-center gap-1 text-[15px] text-cyan hover:underline underline-offset-4">
            <Icon name="back" className="h-3.5 w-3.5" /> Analisar outro vídeo
          </button>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="eyebrow text-mist">Passo final</p>
              <h1 className="mt-3 font-display text-[clamp(48px,7vw,88px)] font-extrabold uppercase leading-[0.88]">
                Escolha a pessoa
              </h1>
              <p className="mt-4 max-w-[560px] text-mist">
                Marcamos quem parece ser o pregador. Se não for, clique em outra pessoa e as fotos são refeitas na hora.
              </p>
            </div>
            <p className="max-w-full truncate text-[15px] text-faint" title={fileName}>
              {fileName}
            </p>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" role="radiogroup" aria-label="Pessoas encontradas">
            {people.map((p, i) => {
              const on = i === selected;
              return (
                <button
                  key={p.id}
                  role="radio"
                  aria-checked={on}
                  onClick={() => onSelect(i)}
                  className={`cursor-pointer overflow-hidden rounded-[4px] border-2 bg-panel text-left transition-colors duration-200 ${
                    on ? "border-cyan" : "border-transparent hover:border-line-strong"
                  }`}
                >
                  <div className="relative aspect-square bg-navy">
                    {p.thumb && <img src={p.thumb} alt={`Pessoa ${i + 1}`} className="h-full w-full object-cover" />}
                    {i === 0 && (
                      <span className="absolute inset-x-0 bottom-0 bg-cyan px-2 py-1 text-center font-display text-[12px] font-bold uppercase tracking-[0.14em] text-abyss">
                        Provável pregador
                      </span>
                    )}
                  </div>
                  <div className="px-3 py-3">
                    <p className="font-display text-[15px] font-semibold uppercase tracking-[0.1em]">Pessoa {i + 1}</p>
                    <p className="text-[14px] text-mist">
                      {Math.max(1, Math.round(p.percent))}% do vídeo
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* FOTOS */}
      <section className="border-t border-line bg-abyss px-4 pb-24 pt-14 sm:px-6">
        <div className="mx-auto max-w-[1180px]">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="font-display text-[clamp(40px,5vw,64px)] font-extrabold uppercase leading-none">
              Melhores <span className="text-cyan">frames</span>
            </h2>
            <Button onClick={onZip} disabled={!!selecting || !picks.length || !!busy}>
              <Icon name="zip" /> {busy === "zip" ? "Montando o zip" : "Baixar todas (.zip)"}
            </Button>
          </div>

          {selecting && (
            <div className="mt-8 border border-line px-6 py-5">
              <div className="flex items-center justify-between text-[15px]">
                <span className="eyebrow text-white">{selecting.label}</span>
                <span className="font-display text-[17px] font-semibold text-mist">
                  {selecting.done} de {selecting.total}
                </span>
              </div>
              <div className="mt-4 h-1 bg-line-strong">
                <div
                  className="h-full bg-cyan transition-[width] duration-300"
                  style={{ width: `${selecting.total ? (selecting.done / selecting.total) * 100 : 3}%` }}
                />
              </div>
              <p className="mt-3 text-[15px] text-mist">Olhando os frames vizinhos de cada candidata para fugir do borrão de movimento.</p>
            </div>
          )}

          {!selecting && !picks.length && (
            <p className="mt-8 text-mist">Não achamos fotos boas dessa pessoa. Tente outra pessoa ou um intervalo de análise menor.</p>
          )}

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {picks.map((p, i) => (
              <article key={`${p.t}-${i}`} className="rise overflow-hidden rounded-[4px] bg-panel">
                <div className="relative bg-navy" style={{ aspectRatio: `${p.frameWidth} / ${p.frameHeight}` }}>
                  {p.preview && <img src={p.preview} alt={`Frame em ${clockLabel(p.t)}`} className="h-full w-full object-cover" />}
                  <div
                    className="pointer-events-none absolute border border-dashed border-white/70"
                    style={{
                      left: `${(p.crop.x / p.frameWidth) * 100}%`,
                      top: `${(p.crop.y / p.frameHeight) * 100}%`,
                      width: `${(p.crop.w / p.frameWidth) * 100}%`,
                      height: `${(p.crop.h / p.frameHeight) * 100}%`,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between px-4 pt-4">
                  <span className="font-display text-[22px] font-bold leading-none">{clockLabel(p.t)}</span>
                  <span className="eyebrow text-[12px] text-mist">
                    Nota <span className="font-bold text-cyan">{Math.round(p.finalScore * 100)}</span>
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 p-4">
                  <Button variant="quiet" className="whitespace-nowrap px-2 text-[13px]" onClick={() => onFull(p)} disabled={!!busy}>
                    <Icon name="download" /> Inteiro
                  </Button>
                  <Button variant="quiet" className="whitespace-nowrap px-2 text-[13px]" onClick={() => onCrop(p)} disabled={!!busy}>
                    <Icon name="download" /> Recorte 4:5
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
