"use client";
import type { ReactNode } from "react";
import type { ScanSummary } from "@/lib/storage";
import { Card, Icon, SectionTitle, Wordmark } from "./ui";

export type Step = 0 | 1 | 2;

/**
 * Estrutura no estilo da Apple: barra global fina e translucida no topo,
 * conteudo alinhado a esquerda em largura maxima, painel de resumo a direita
 * (como na pagina de configurar produto) e rodape cinza.
 */
export function Shell({
  children,
  inspector,
  recents,
  onRecent,
  onHome,
  showRecents = false,
}: {
  children: ReactNode;
  inspector?: ReactNode;
  recents: ScanSummary[];
  onRecent: (r: ScanSummary) => void;
  onHome: () => void;
  showRecents?: boolean;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 bg-[var(--nav)] backdrop-blur-[20px] backdrop-saturate-[180%]">
        <nav className="mx-auto flex h-11 max-w-[1024px] items-center justify-between px-4 text-[12px] text-ink/80 sm:px-6" aria-label="Principal">
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
        <div className="mx-auto grid max-w-[1200px] gap-8 px-4 pb-20 sm:px-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0">{children}</div>
          {inspector && (
            <aside className="xl:pt-[164px]" aria-label="Ajustes">
              <div className="space-y-4 xl:sticky xl:top-16">{inspector}</div>
            </aside>
          )}
        </div>

        {showRecents && recents.length > 0 && (
          <section className="mx-auto max-w-[1200px] px-4 pb-20 sm:px-6">
            <SectionTitle title="Recentes." tail="Escolha o mesmo arquivo para continuar." />
            <div className="mt-5 flex gap-4 overflow-x-auto pb-4">
              {recents.slice(0, 8).map((r) => (
                <button
                  key={r.key}
                  onClick={() => onRecent(r)}
                  title={r.fileName}
                  className="w-[260px] shrink-0 cursor-pointer rounded-[18px] bg-surface p-5 text-left shadow-[var(--shadow-card)] transition-shadow duration-300 hover:shadow-[var(--shadow-card-hover)]"
                >
                  <Icon name="clock" className="h-6 w-6 text-ink-2" />
                  <p className="mt-6 truncate text-[17px] font-semibold">{r.fileName}</p>
                  <p className="mt-1 text-[14px] text-ink-2">{r.done ? "Análise concluída" : `${r.percent}% analisado`}</p>
                </button>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer id="ajuda" className="border-t border-hairline/70 bg-bg">
        <div className="mx-auto max-w-[1024px] px-4 py-5 text-[12px] leading-[1.33] text-ink-2 sm:px-6">
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

/** Cabecalho da pagina: titulo grande a esquerda, como "Comprar Mac", e etapas. */
export function WorkHeader({ title, subtitle, step, actions }: { title: string; subtitle?: string; step: Step; actions?: ReactNode }) {
  const steps = ["Vídeo", "Análise", "Pessoa e fotos"];
  return (
    <div className="pt-10 sm:pt-14">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <h1 className="headline text-[48px] sm:text-[64px] lg:text-[80px]">{title}</h1>
          {subtitle && <p className="mt-3 max-w-[680px] truncate text-[21px] leading-[1.38] text-ink-2">{subtitle}</p>}
        </div>
        {actions}
      </div>
      <ol className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-hairline pb-3 text-[14px]" aria-label="Etapas">
        {steps.map((s, i) => (
          <li
            key={s}
            aria-current={i === step ? "step" : undefined}
            className={`flex items-center gap-1.5 ${i === step ? "font-semibold text-ink" : i < step ? "text-ink" : "text-ink-3"}`}
          >
            {i < step ? <Icon name="check" className="h-3.5 w-3.5 text-blue" /> : <span className="tabular-nums">{i + 1}.</span>}
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Bloco do painel de resumo: cartao branco com titulo. */
export function InspectorSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="p-6">
      <h3 className="text-[17px] font-semibold">{title}</h3>
      <div className="mt-4 space-y-5">{children}</div>
    </Card>
  );
}
