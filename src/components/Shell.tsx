"use client";
import type { ReactNode } from "react";
import type { ScanSummary } from "@/lib/storage";
import { Card, Icon, Wordmark } from "./ui";

export type Step = 0 | 1 | 2;

/**
 * Estrutura da pagina: barra fina no topo, uma coluna so (uma coisa por vez,
 * de cima para baixo) e rodape. Nada disputando atencao na lateral.
 */
export function Shell({
  children,
  recents,
  onRecent,
  onHome,
  showRecents = false,
}: {
  children: ReactNode;
  recents: ScanSummary[];
  onRecent: (r: ScanSummary) => void;
  onHome: () => void;
  showRecents?: boolean;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 bg-[var(--nav)] backdrop-blur-[20px] backdrop-saturate-[180%]">
        <nav className="mx-auto flex h-11 max-w-[1100px] items-center justify-between px-4 text-[12px] text-ink/80 sm:px-6" aria-label="Principal">
          <button onClick={onHome} className="cursor-pointer text-ink hover:text-ink/70" aria-label="Início">
            <Wordmark />
          </button>
          <ul className="hidden items-center gap-8 md:flex">
            <li>
              <button onClick={onHome} className="cursor-pointer text-ink hover:text-ink/70" aria-current="page">Melhores frames</button>
            </li>
            <li className="text-ink-3">Thumbnails com PSD (em breve)</li>
            <li>
              <a href="#ajuda" className="hover:text-ink">Ajuda</a>
            </li>
          </ul>
          <span className="text-ink-2">Roda no seu computador</span>
        </nav>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-[1100px] px-4 pb-20 sm:px-6">{children}</div>

        {showRecents && recents.length > 0 && (
          <section className="mx-auto max-w-[1100px] px-4 pb-20 sm:px-6">
            <h2 className="text-[17px] font-semibold">Análises recentes</h2>
            <p className="mt-1 text-[14px] text-ink-2">Escolha o mesmo arquivo de novo para abrir ou continuar.</p>
            <div className="mt-4 flex gap-3 overflow-x-auto pb-4">
              {recents.slice(0, 8).map((r) => (
                <button
                  key={r.key}
                  onClick={() => onRecent(r)}
                  title={r.fileName}
                  className="flex w-[260px] shrink-0 cursor-pointer items-center gap-3 rounded-[14px] bg-surface p-4 text-left shadow-[var(--shadow-card)] transition-shadow duration-300 hover:shadow-[var(--shadow-card-hover)]"
                >
                  <Icon name="clock" className="h-5 w-5 shrink-0 text-ink-2" />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold">{r.fileName}</span>
                    <span className="block text-[12px] text-ink-2">{r.done ? "Análise concluída" : `${r.percent}% analisado`}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer id="ajuda" className="border-t border-hairline/70 bg-bg">
        <div className="mx-auto max-w-[1100px] px-4 py-5 text-[12px] leading-[1.33] text-ink-2 sm:px-6">
          <p className="border-b border-hairline/70 pb-4">
            O vídeo é lido no seu computador e não é enviado para lugar nenhum. Para conseguir o arquivo de uma pregação
            do canal da igreja, abra o YouTube Studio, vá em Conteúdo, clique nos três pontos do vídeo e escolha Baixar.
          </p>
          <p className="pt-4">Frame do Pregador. Feito para designers de igreja.</p>
        </div>
      </footer>
    </div>
  );
}

const STEPS = ["Vídeo", "Análise", "Fotos"];

/**
 * Cabecalho de cada etapa, na ordem de leitura:
 * 1. onde estou ("Passo 1 de 3"), 2. o que fazer (titulo grande),
 * 3. por que (uma frase), 4. a acao principal.
 */
export function StepHero({
  step,
  title,
  subtitle,
  actions,
}: {
  step: Step;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="pt-12 sm:pt-16">
      <div className="flex items-center gap-4">
        <p className="kicker text-blue">
          Passo {step + 1} de 3 <span className="text-ink-3">· {STEPS[step]}</span>
        </p>
        <div className="flex gap-1" aria-hidden>
          {STEPS.map((s, i) => (
            <span key={s} className={`h-[3px] w-8 rounded-full ${i <= step ? "bg-blue" : "bg-hairline"}`} />
          ))}
        </div>
      </div>
      <h1 className="title mt-4 text-[52px] sm:text-[72px] lg:text-[88px]">{title}</h1>
      {subtitle && <p className="mt-5 max-w-[640px] text-[19px] leading-[1.42] text-ink-2 sm:text-[21px]">{subtitle}</p>}
      {actions && <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">{actions}</div>}
    </header>
  );
}

/** Destaque em azul dentro do titulo, como nos sites de referencia. */
export function Accent({ children }: { children: ReactNode }) {
  return <span className="text-blue">{children}</span>;
}

/** Bloco recolhido para o que e opcional (ajustes). */
export function Disclosure({ title, hint, children, open = false }: { title: string; hint?: string; children: ReactNode; open?: boolean }) {
  return (
    <Card className="overflow-hidden">
      <details open={open}>
        <summary className="flex cursor-pointer items-center justify-between gap-4 px-6 py-5">
          <span>
            <span className="block text-[17px] font-semibold">{title}</span>
            {hint && <span className="block text-[14px] text-ink-2">{hint}</span>}
          </span>
          <Icon name="chevron" className="chev h-4 w-4 shrink-0 text-ink-2 transition-transform duration-200" />
        </summary>
        <div className="border-t border-hairline/70 px-6 py-6">{children}</div>
      </details>
    </Card>
  );
}
