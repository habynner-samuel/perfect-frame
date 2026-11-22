"use client";
import type { Person, Pick } from "@/lib/types";
import { clockLabel } from "@/lib/pipeline";
import { WorkHeader } from "./Shell";
import { Button, Card, Icon, SectionTitle } from "./ui";

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
        title="Suas fotos."
        subtitle={fileName}
        actions={
          <Button onClick={onZip} disabled={!!selecting || !picks.length || !!busy}>
            {busy === "zip" ? "Montando o zip..." : "Baixar todas"}
          </Button>
        }
      />

      <div className="mt-10">
        <SectionTitle title="Pessoas encontradas." tail="O provável pregador já vem marcado." />
        <div className="-mx-1 mt-5 flex gap-4 overflow-x-auto px-1 pb-4" role="radiogroup" aria-label="Pessoas encontradas">
          {people.map((p, i) => {
            const on = i === selected;
            return (
              <button
                key={p.id}
                role="radio"
                aria-checked={on}
                onClick={() => onSelect(i)}
                className={`w-[180px] shrink-0 cursor-pointer overflow-hidden rounded-[18px] bg-surface text-left shadow-[var(--shadow-card)] outline-offset-0 transition-shadow duration-300 hover:shadow-[var(--shadow-card-hover)] ${
                  on ? "outline-2 outline-blue" : ""
                }`}
              >
                <div className="aspect-square bg-fill">
                  {p.thumb && <img src={p.thumb} alt={`Pessoa ${i + 1}`} className="h-full w-full object-cover" />}
                </div>
                <div className="px-4 pb-4 pt-3">
                  {i === 0 && <p className="text-[12px] font-semibold text-[#bf4800]">Provável pregador</p>}
                  <p className="text-[17px] font-semibold">Pessoa {i + 1}</p>
                  <p className="text-[14px] text-ink-2">Em {Math.max(1, Math.round(p.percent))}% do vídeo</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-10">
          <SectionTitle title="Melhores frames." tail={picks.length ? `${picks.length} fotos, da melhor para a pior.` : undefined} />

          {selecting && (
            <Card className="mt-5 p-6">
              <div className="flex items-center justify-between text-[17px]">
                <span className="font-semibold">{selecting.label}</span>
                <span className="tabular-nums text-ink-2">
                  {selecting.done} de {selecting.total}
                </span>
              </div>
              <div className="mt-4 h-1 overflow-hidden rounded-full bg-fill">
                <div className="h-full rounded-full bg-blue transition-[width] duration-300" style={{ width: `${selecting.total ? (selecting.done / selecting.total) * 100 : 3}%` }} />
              </div>
              <p className="mt-3 text-[14px] text-ink-2">Olhando os quadros vizinhos de cada foto para fugir do borrão de movimento.</p>
            </Card>
          )}

          {!selecting && !picks.length && (
            <p className="mt-5 text-[17px] text-ink-2">Não achamos fotos boas dessa pessoa. Tente outra pessoa ou um intervalo de análise menor.</p>
          )}

          <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
            {picks.map((p, i) => (
              <article key={`${p.t}-${i}`} className="group overflow-hidden rounded-[18px] bg-surface shadow-[var(--shadow-card)]">
                <div className="relative bg-ink" style={{ aspectRatio: `${p.frameWidth} / ${p.frameHeight}` }}>
                  {p.preview && <img src={p.preview} alt={`Frame em ${clockLabel(p.t)}`} className="h-full w-full object-cover" />}
                  <div
                    className="pointer-events-none absolute rounded-[4px] border border-white/80 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                    style={{
                      left: `${(p.crop.x / p.frameWidth) * 100}%`,
                      top: `${(p.crop.y / p.frameHeight) * 100}%`,
                      width: `${(p.crop.w / p.frameWidth) * 100}%`,
                      height: `${(p.crop.h / p.frameHeight) * 100}%`,
                    }}
                  />
                </div>
                <div className="px-5 pb-5 pt-4">
                  <div className="flex items-baseline justify-between">
                    <p className="text-[17px] font-semibold tabular-nums">{clockLabel(p.t)}</p>
                    <p className="text-[14px] text-ink-2">
                      Nota <span className="tabular-nums text-ink">{Math.round(p.finalScore * 100)}</span>
                    </p>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[14px]">
                    <button onClick={() => onFull(p)} disabled={!!busy} className="inline-flex cursor-pointer items-center gap-1 text-link hover:underline disabled:opacity-40">
                      Baixar inteiro <Icon name="download" className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => onCrop(p)} disabled={!!busy} className="inline-flex cursor-pointer items-center gap-1 text-link hover:underline disabled:opacity-40">
                      Baixar recorte 4:5 <Icon name="download" className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
