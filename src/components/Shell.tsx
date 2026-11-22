"use client";
import type { ReactNode } from "react";
import type { ScanSummary } from "@/lib/storage";
import { Icon, SectionLabel, Wordmark } from "./ui";

export type Step = 0 | 1 | 2;

/**
 * Estrutura de aplicativo: barra superior, menu de ferramentas a esquerda,
 * area de trabalho no centro e painel de ajustes a direita.
 */
export function Shell({
  children,
  inspector,
  recents,
  onRecent,
  onHome,
}: {
  children: ReactNode;
  inspector?: ReactNode;
  recents: ScanSummary[];
  onRecent: (r: ScanSummary) => void;
  onHome: () => void;
}) {
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-line bg-abyss px-4">
        <button onClick={onHome} className="cursor-pointer" aria-label="Novo projeto">
          <Wordmark />
        </button>
        <span className="hidden items-center gap-2 text-[13px] text-faint sm:flex">
          <span className="inline-block h-1.5 w-1.5 bg-cyan" aria-hidden />
          Processamento no seu computador
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-navy lg:flex">
          <nav className="p-3" aria-label="Ferramentas">
            <SectionLabel className="px-2 pb-2 pt-1">Ferramentas</SectionLabel>
            <button
              onClick={onHome}
              aria-current="page"
              className="flex w-full cursor-pointer items-center gap-3 rounded-[3px] bg-white/[0.07] px-2 py-2 text-left text-[14px] text-white"
            >
              <Icon name="frame" className="h-4 w-4 text-cyan" />
              Melhores frames
            </button>
            <div className="mt-0.5 flex items-center gap-3 px-2 py-2 text-[14px] text-faint" aria-disabled>
              <Icon name="layers" className="h-4 w-4" />
              <span className="whitespace-nowrap">Thumbnails PSD</span>
              <span className="ml-auto whitespace-nowrap border border-line px-1.5 py-px text-[10px] uppercase tracking-[0.08em]">Em breve</span>
            </div>
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto border-t border-line p-3">
            <SectionLabel className="px-2 pb-2 pt-1">Recentes</SectionLabel>
            {recents.length === 0 && <p className="px-2 text-[13px] text-faint">Nenhuma análise ainda.</p>}
            <ul>
              {recents.slice(0, 8).map((r) => (
                <li key={r.key}>
                  <button
                    onClick={() => onRecent(r)}
                    title={r.fileName}
                    className="flex w-full cursor-pointer items-center gap-3 rounded-[3px] px-2 py-2 text-left hover:bg-white/5"
                  >
                    <Icon name="clock" className="h-4 w-4 shrink-0 text-faint" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-white">{r.fileName}</span>
                      <span className="block text-[12px] text-faint">{r.done ? "Concluída" : `${r.percent}% analisado`}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <p className="border-t border-line p-4 text-[12px] leading-relaxed text-faint">
            O vídeo é lido no seu computador e não é enviado para lugar nenhum.
          </p>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto bg-abyss">
          {children}
          {inspector && <div className="border-t border-line bg-navy xl:hidden">{inspector}</div>}
        </main>

        {inspector && (
          <aside className="hidden w-[320px] shrink-0 overflow-y-auto border-l border-line bg-navy xl:block" aria-label="Painel de ajustes">
            {inspector}
          </aside>
        )}
      </div>
    </div>
  );
}

/** Cabecalho da area de trabalho: titulo a esquerda e etapas. */
export function WorkHeader({ title, subtitle, step, actions }: { title: string; subtitle?: string; step: Step; actions?: ReactNode }) {
  const steps = ["Vídeo", "Análise", "Pessoa e fotos"];
  return (
    <div className="border-b border-line px-6 pb-5 pt-6 lg:px-8">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]" aria-label="Etapas">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span
              className={`grid h-5 w-5 place-items-center text-[11px] font-semibold tabular-nums ${
                i < step ? "bg-cyan text-abyss" : i === step ? "border border-white text-white" : "border border-line-strong text-faint"
              }`}
              aria-current={i === step ? "step" : undefined}
            >
              {i < step ? <Icon name="check" className="h-3 w-3" /> : i + 1}
            </span>
            <span className={i === step ? "text-white" : "text-faint"}>{s}</span>
            {i < steps.length - 1 && <span className="mx-1 h-px w-6 bg-line-strong" aria-hidden />}
          </li>
        ))}
      </ol>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[34px] font-bold uppercase leading-none tracking-[0.01em]">{title}</h1>
          {subtitle && <p className="mt-2 max-w-[640px] text-[15px] text-mist">{subtitle}</p>}
        </div>
        {actions}
      </div>
    </div>
  );
}

/** Bloco do painel de ajustes. */
export function InspectorSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-line p-5">
      <SectionLabel>{title}</SectionLabel>
      <div className="mt-4 space-y-5">{children}</div>
    </section>
  );
}
