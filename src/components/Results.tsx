"use client";
import type { Person, Pick } from "@/lib/types";
import { clockLabel } from "@/lib/pipeline";
import { Button, Card, Icon, Pill } from "./ui";

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
    <section className="mx-auto max-w-[1240px] px-4 pb-24 pt-6 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <button onClick={onRestart} className="mb-3 inline-flex cursor-pointer items-center gap-1 text-sm text-muted hover:text-cream">
            <Icon name="back" /> Analisar outro vídeo
          </button>
          <h1 className="font-display text-[clamp(44px,6vw,80px)] uppercase leading-[0.9]">
            Escolha a <span className="text-gradient">pessoa</span>
          </h1>
          <p className="mt-3 max-w-xl text-muted">
            Marcamos quem parece ser o pregador. Se não for, clique em outra pessoa e as fotos são refeitas na hora.
          </p>
        </div>
        <Pill className="max-w-full truncate">
          <Icon name="film" className="h-3.5 w-3.5 text-amber" />
          <span className="truncate">{fileName}</span>
        </Pill>
      </div>

      {/* PESSOAS */}
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" role="radiogroup" aria-label="Pessoas encontradas">
        {people.map((p, i) => {
          const on = i === selected;
          return (
            <button
              key={p.id}
              role="radio"
              aria-checked={on}
              onClick={() => onSelect(i)}
              className={`group relative cursor-pointer rounded-[24px] border p-2.5 text-left transition ${
                on ? "border-amber bg-surface-2 shadow-[0_0_0_3px_rgba(242,165,74,0.25)]" : "border-line bg-surface hover:border-line-strong"
              }`}
            >
              <div className="relative aspect-square overflow-hidden rounded-[18px] bg-surface-3">
                {p.thumb && <img src={p.thumb} alt={`Pessoa ${i + 1}`} className="h-full w-full object-cover" />}
                {on && (
                  <span className="bg-ember-gradient absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full text-[#1f0f05]">
                    <Icon name="check" className="h-4 w-4" />
                  </span>
                )}
              </div>
              <div className="px-1.5 pb-1 pt-3">
                {i === 0 ? (
                  <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber">Provável pregador</span>
                ) : (
                  <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-faint">Pessoa {i + 1}</span>
                )}
                <p className="mt-1 text-sm text-muted">
                  Aparece em <strong className="text-cream">{Math.max(1, Math.round(p.percent))}%</strong> do vídeo
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* BARRA DE ACOES */}
      <div className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-8">
        <h2 className="font-display text-[clamp(34px,4vw,52px)] uppercase leading-none">
          Melhores <span className="text-gradient">frames</span>
        </h2>
        <Button onClick={onZip} disabled={!!selecting || !picks.length || !!busy}>
          <Icon name="zip" /> {busy === "zip" ? "Montando o zip..." : "Baixar todas em .zip"}
        </Button>
      </div>

      {selecting && (
        <Card className="mt-6 overflow-hidden p-6">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">{selecting.label}</span>
            <span className="text-muted">
              {selecting.done} de {selecting.total}
            </span>
          </div>
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-surface-3">
            <div
              className="bg-ember-gradient h-full rounded-full transition-[width] duration-300"
              style={{ width: `${selecting.total ? (selecting.done / selecting.total) * 100 : 4}%` }}
            />
          </div>
          <p className="mt-3 text-sm text-muted">
            Olhando os frames vizinhos de cada candidata para fugir do borrão de movimento.
          </p>
        </Card>
      )}

      {!selecting && !picks.length && (
        <p className="mt-8 text-muted">Não achamos fotos boas dessa pessoa. Tente outra pessoa ou um intervalo de análise menor.</p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {picks.map((p, i) => (
          <Card key={`${p.t}-${i}`} className="rise overflow-hidden p-2.5">
            <div className="relative overflow-hidden rounded-[20px] bg-surface-3" style={{ aspectRatio: `${p.frameWidth} / ${p.frameHeight}` }}>
              {p.preview && <img src={p.preview} alt={`Frame em ${clockLabel(p.t)}`} className="h-full w-full object-cover" />}
              {/* marca do recorte 4:5 */}
              <div
                className="pointer-events-none absolute rounded-md border border-dashed border-gold/70"
                style={{
                  left: `${(p.crop.x / p.frameWidth) * 100}%`,
                  top: `${(p.crop.y / p.frameHeight) * 100}%`,
                  width: `${(p.crop.w / p.frameWidth) * 100}%`,
                  height: `${(p.crop.h / p.frameHeight) * 100}%`,
                }}
              />
              <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold backdrop-blur">
                {clockLabel(p.t)}
              </span>
              <span className="bg-ember-gradient absolute right-3 top-3 rounded-full px-2.5 py-1 text-xs font-bold text-[#1f0f05]">
                Nota {Math.round(p.finalScore * 100)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 p-1.5 pt-3">
              <Button variant="soft" className="whitespace-nowrap px-3 text-[13px]" onClick={() => onFull(p)} disabled={!!busy}>
                <Icon name="download" /> Frame inteiro
              </Button>
              <Button variant="soft" className="whitespace-nowrap px-3 text-[13px]" onClick={() => onCrop(p)} disabled={!!busy}>
                <Icon name="download" /> Recorte 4:5
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
