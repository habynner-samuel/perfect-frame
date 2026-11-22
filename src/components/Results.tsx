"use client";
import type { Person, Pick } from "@/lib/types";
import { clockLabel } from "@/lib/pipeline";
import { SectionLabel } from "./ui";
import { WorkHeader } from "./Shell";
import { Button, Icon } from "./ui";

/** Etapa 3: escolher a pessoa e baixar as fotos. */
export function ResultsView({
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
}) {
  return (
    <>
      <WorkHeader
        step={2}
        title="Pessoa e fotos"
        subtitle={fileName}
        actions={
          <Button onClick={onZip} disabled={!!selecting || !picks.length || !!busy}>
            <Icon name="zip" /> {busy === "zip" ? "Montando o zip" : "Baixar todas (.zip)"}
          </Button>
        }
      />

      <div className="px-6 py-6 lg:px-8">
        <div className="flex items-baseline justify-between gap-4">
          <SectionLabel>Pessoas encontradas</SectionLabel>
          <span className="text-[13px] text-faint">Clique em outra pessoa se o pregador não for o marcado.</span>
        </div>
        <div className="mt-3 flex gap-3 overflow-x-auto pb-1" role="radiogroup" aria-label="Pessoas encontradas">
          {people.map((p, i) => {
            const on = i === selected;
            return (
              <button
                key={p.id}
                role="radio"
                aria-checked={on}
                onClick={() => onSelect(i)}
                className={`w-[132px] shrink-0 cursor-pointer overflow-hidden rounded-[4px] border bg-panel text-left transition-colors duration-150 ${
                  on ? "border-cyan" : "border-line hover:border-line-strong"
                }`}
              >
                <div className="relative aspect-square bg-navy">
                  {p.thumb && <img src={p.thumb} alt={`Pessoa ${i + 1}`} className="h-full w-full object-cover" />}
                  {on && (
                    <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center bg-cyan text-abyss">
                      <Icon name="check" className="h-3.5 w-3.5" />
                    </span>
                  )}
                </div>
                <div className="px-2.5 py-2">
                  <p className="truncate text-[13px] font-medium">{i === 0 ? "Provável pregador" : `Pessoa ${i + 1}`}</p>
                  <p className="text-[12px] text-faint">{Math.max(1, Math.round(p.percent))}% do vídeo</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-8 flex items-baseline justify-between gap-4">
          <SectionLabel>Melhores frames</SectionLabel>
          {!!picks.length && <span className="text-[13px] text-faint">{picks.length} fotos, da melhor para a pior</span>}
        </div>

        {selecting && (
          <div className="mt-3 rounded-[4px] border border-line p-5">
            <div className="flex items-center justify-between text-[14px]">
              <span>{selecting.label}</span>
              <span className="tabular-nums text-mist">
                {selecting.done} de {selecting.total}
              </span>
            </div>
            <div className="mt-3 h-1 bg-line-strong">
              <div className="h-full bg-cyan transition-[width] duration-300" style={{ width: `${selecting.total ? (selecting.done / selecting.total) * 100 : 3}%` }} />
            </div>
            <p className="mt-3 text-[13px] text-faint">Olhando os frames vizinhos de cada candidata para fugir do borrão de movimento.</p>
          </div>
        )}

        {!selecting && !picks.length && (
          <p className="mt-3 text-[14px] text-mist">Não achamos fotos boas dessa pessoa. Tente outra pessoa ou um intervalo de análise menor.</p>
        )}

        <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
          {picks.map((p, i) => (
            <article key={`${p.t}-${i}`} className="group overflow-hidden rounded-[4px] border border-line bg-panel">
              <div className="relative bg-navy" style={{ aspectRatio: `${p.frameWidth} / ${p.frameHeight}` }}>
                {p.preview && <img src={p.preview} alt={`Frame em ${clockLabel(p.t)}`} className="h-full w-full object-cover" />}
                <div
                  className="pointer-events-none absolute border border-dashed border-white/60 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                  style={{
                    left: `${(p.crop.x / p.frameWidth) * 100}%`,
                    top: `${(p.crop.y / p.frameHeight) * 100}%`,
                    width: `${(p.crop.w / p.frameWidth) * 100}%`,
                    height: `${(p.crop.h / p.frameHeight) * 100}%`,
                  }}
                />
                <span className="absolute left-2 top-2 bg-abyss/80 px-1.5 py-0.5 text-[12px] font-medium tabular-nums">#{i + 1}</span>
              </div>
              <div className="flex items-center justify-between px-3 pt-2.5 text-[13px]">
                <span className="tabular-nums text-white">{clockLabel(p.t)}</span>
                <span className="text-faint">
                  Nota <span className="tabular-nums text-cyan">{Math.round(p.finalScore * 100)}</span>
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 p-3">
                <Button variant="outline" size="sm" onClick={() => onFull(p)} disabled={!!busy}>
                  <Icon name="download" className="h-3.5 w-3.5" /> Inteiro
                </Button>
                <Button variant="outline" size="sm" onClick={() => onCrop(p)} disabled={!!busy}>
                  <Icon name="download" className="h-3.5 w-3.5" /> Recorte 4:5
                </Button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </>
  );
}
