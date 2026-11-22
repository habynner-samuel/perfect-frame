"use client";
import type { Person, Pick, ScanSettings } from "@/lib/types";
import { clockLabel } from "@/lib/pipeline";
import { SettingsFields } from "./Home";
import { Accent, Disclosure, StepHero } from "./Shell";
import { Button, Card, Icon } from "./ui";

/**
 * Etapa 3, na ordem de leitura: o titulo diz que as fotos estao prontas e
 * oferece baixar; logo abaixo as fotos; trocar de pessoa e ajustes ficam
 * menores, porque so sao usados quando algo nao saiu como esperado.
 */
export function ResultsView({
  people,
  selected,
  onSelect,
  picks,
  selecting,
  busy,
  onFull,
  onCrop,
  onZip,
  onMore,
  onRedo,
  settings,
  onSettings,
}: {
  people: Person[];
  selected: number;
  onSelect: (i: number) => void;
  picks: Pick[];
  selecting: { done: number; total: number; label: string } | null;
  busy: string | null;
  onFull: (p: Pick) => void;
  onCrop: (p: Pick) => void;
  onZip: () => void;
  onMore: () => void;
  onRedo: () => void;
  settings: ScanSettings;
  onSettings: (s: ScanSettings) => void;
}) {
  const who = selected === 0 ? "do provável pregador" : `da pessoa ${selected + 1}`;
  const ready = !selecting && picks.length > 0;

  return (
    <>
      <StepHero
        step={2}
        title={selecting ? <>Escolhendo <Accent>as fotos</Accent></> : <>Suas fotos <Accent>estão prontas</Accent></>}
        subtitle={
          selecting
            ? "Olhando os quadros vizinhos de cada foto para fugir do borrão e escolher a melhor pose."
            : picks.length
              ? `${picks.length} fotos ${who}, da melhor para a pior. Baixe todas de uma vez ou uma por uma.`
              : "Não achamos fotos boas dessa pessoa. Tente outra pessoa abaixo."
        }
        actions={
          selecting ? undefined : <>
            <Button onClick={onZip} disabled={!ready || !!busy}>
              <Icon name="download" className="h-4 w-4" /> {busy === "zip" ? "Montando o zip..." : "Baixar todas (.zip)"}
            </Button>
            <Button variant="outline" onClick={onMore} disabled={!ready}>
              <Icon name="refresh" className="h-4 w-4" /> Buscar outras fotos
            </Button>
          </>
        }
      />

      {selecting && (
        <div className="mt-8 max-w-[520px]">
          <div className="flex items-center justify-between text-[14px]">
            <span className="font-semibold">{selecting.label}</span>
            <span className="tabular-nums text-ink-2">
              {selecting.done} de {selecting.total}
            </span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-fill">
            <div className="h-full rounded-full bg-blue transition-[width] duration-300" style={{ width: `${selecting.total ? (selecting.done / selecting.total) * 100 : 3}%` }} />
          </div>
        </div>
      )}

      {/* Pessoa: secundario, para corrigir quando nao for o pregador */}
      <section className="mt-12" aria-label="Pessoa">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-[17px] font-semibold">De quem são as fotos</h2>
          <p className="text-[14px] text-ink-2">Não é o pregador? Clique em outra pessoa.</p>
        </div>
        <div className="-mx-1 mt-4 flex gap-3 overflow-x-auto px-1 pb-2" role="radiogroup" aria-label="Pessoas encontradas">
          {people.map((p, i) => {
            const on = i === selected;
            return (
              <button
                key={p.id}
                role="radio"
                aria-checked={on}
                onClick={() => onSelect(i)}
                className={`flex w-[260px] shrink-0 cursor-pointer items-center gap-3 rounded-[14px] bg-surface p-2.5 pr-4 text-left shadow-[var(--shadow-card)] transition-shadow duration-300 hover:shadow-[var(--shadow-card-hover)] ${
                  on ? "outline-2 outline-blue" : ""
                }`}
              >
                <span className="h-14 w-14 shrink-0 overflow-hidden rounded-[10px] bg-fill">
                  {p.thumb && <img src={p.thumb} alt="" className="h-full w-full object-cover" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold">{i === 0 ? "Provável pregador" : `Pessoa ${i + 1}`}</span>
                  <span className="block text-[13px] text-ink-2">Em {Math.max(1, Math.round(p.percent))}% do vídeo</span>
                </span>
                {on && <Icon name="check" className="ml-auto h-4 w-4 shrink-0 text-blue" />}
              </button>
            );
          })}
        </div>
      </section>

      {/* Fotos: o principal da pagina */}
      <section className="mt-10" aria-label="Fotos">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5">
          {picks.map((p, i) => (
            <article key={`${p.t}-${i}`} className="group overflow-hidden rounded-[18px] bg-surface shadow-[var(--shadow-card)]">
              <div className="relative bg-ink" style={{ aspectRatio: `${p.frameWidth} / ${p.frameHeight}` }}>
                {p.preview && <img src={p.preview} alt={`Frame em ${clockLabel(p.t)}`} className="h-full w-full object-cover" />}
                <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[12px] font-semibold text-white backdrop-blur">
                  {i === 0 ? "Melhor foto" : `#${i + 1}`}
                </span>
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
              <div className="flex items-center justify-between gap-3 px-5 py-4">
                <p className="text-[13px] tabular-nums text-ink-2">
                  {clockLabel(p.t)} · nota {Math.round(p.finalScore * 100)}
                </p>
                <div className="flex gap-4 text-[14px]">
                  <button onClick={() => onFull(p)} disabled={!!busy} className="inline-flex cursor-pointer items-center gap-1 text-link hover:underline disabled:opacity-40">
                    Inteiro <Icon name="download" className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => onCrop(p)} disabled={!!busy} className="inline-flex cursor-pointer items-center gap-1 text-link hover:underline disabled:opacity-40">
                    4:5 <Icon name="download" className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="mt-10">
        <Disclosure title="Ajustar a seleção" hint="Mudar quantidade de fotos ou distância entre elas.">
          <SettingsFields settings={settings} onSettings={onSettings} showInterval={false} />
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Button variant="outline" onClick={onRedo} disabled={!!selecting}>
              Refazer seleção
            </Button>
            <span className="text-[14px] text-ink-2">Volta para as melhores fotos com os ajustes acima, sem analisar o vídeo de novo.</span>
          </div>
        </Disclosure>
      </div>

      <Card className="mt-4 p-6 text-[14px] text-ink-2">
        <span className="font-semibold text-ink">Dica:</span> passe o mouse sobre uma foto para ver onde fica o recorte vertical 4:5.
      </Card>
    </>
  );
}
