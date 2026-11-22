"use client";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import type { ScanSettings } from "@/lib/types";
import { Accent, Disclosure, StepHero } from "./Shell";
import { Button, Card, Icon, Segmented, Slider } from "./ui";

export interface ImportHandle {
  openPicker: () => void;
}

/** Etapa 1: escolher o video. */
export const ImportView = forwardRef<ImportHandle, {
  onFile: (f: File) => void;
  notice: { kind: "error" | "info"; text: string } | null;
  settings: ScanSettings;
  onSettings: (s: ScanSettings) => void;
  /** so aparece quando o ajudante local do YouTube esta rodando */
  onYouTube?: (link: string) => void;
}>(function ImportView({ onFile, notice, settings, onSettings, onYouTube }, ref) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [link, setLink] = useState("");
  const open = () => input.current?.click();
  useImperativeHandle(ref, () => ({ openPicker: open }));
  const pick = (files: FileList | null) => {
    const f = files?.[0];
    if (f) onFile(f);
  };

  return (
    <>
      <StepHero
        step={0}
        title={<>Escolha o vídeo <Accent>da pregação</Accent></>}
        subtitle="O site encontra o pregador e separa os frames com a melhor pose, prontos para a arte de divulgação."
        actions={
          <>
            <Button onClick={open}>
              <Icon name="upload" className="h-4 w-4" /> Escolher arquivo
            </Button>
            <span className="text-[14px] text-ink-2">ou arraste o vídeo para a área abaixo</span>
          </>
        }
      />

      {onYouTube && (
        <Card className="mt-10 p-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (link.trim()) onYouTube(link.trim());
            }}
          >
            <label htmlFor="link-youtube" className="block text-[17px] font-semibold">Importar do YouTube</label>
            <p className="mt-1 text-[14px] text-ink-2">
              Baixa uma versão leve só para analisar. As fotos escolhidas saem da versão em alta qualidade.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                id="link-youtube"
                type="url"
                inputMode="url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={link}
                onChange={(e) => setLink(e.target.value)}
                className="h-11 flex-1 rounded-[12px] border border-hairline bg-surface px-4 text-[17px] text-ink placeholder:text-ink-3 focus:border-blue focus:outline-none"
              />
              <Button type="submit" disabled={!link.trim()}>Importar</Button>
            </div>
          </form>
        </Card>
      )}

      {notice && (
        <div
          role={notice.kind === "error" ? "alert" : "status"}
          className={`mt-8 rounded-[12px] px-5 py-4 text-[15px] ${notice.kind === "error" ? "bg-[#fff0f0] text-red" : "bg-[#e8f2fd] text-ink"}`}
        >
          {notice.text}
        </div>
      )}

      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files); }}
        onClick={open}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && open()}
        aria-label="Área para soltar o vídeo"
        className={`mt-10 flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-[18px] border-2 border-dashed px-6 text-center transition-colors duration-200 ${
          over ? "border-blue bg-[#e8f2fd]" : "border-hairline bg-surface hover:border-ink-3"
        }`}
      >
        <Icon name="upload" className="h-8 w-8 text-ink-3" />
        <p className="mt-4 text-[21px] font-semibold">Solte o vídeo aqui</p>
        <p className="mt-1 text-[14px] text-ink-2">MP4, MOV ou WebM. Pode ser o culto inteiro. Nada é enviado.</p>
      </div>
      <input
        ref={input}
        type="file"
        accept="video/*,.mp4,.mov,.m4v,.webm,.mkv"
        className="hidden"
        onChange={(e) => { pick(e.target.files); e.target.value = ""; }}
      />

      <div className="mt-4 space-y-3">
        <Disclosure title="Ajustes da análise" hint="Opcional. O padrão funciona bem para a maioria dos cultos.">
          <SettingsFields settings={settings} onSettings={onSettings} />
        </Disclosure>
        <Disclosure title="Só tem o link do YouTube?" hint="Como conseguir o arquivo da pregação.">
          <p className="text-[15px] leading-[1.5] text-ink-2">
            Se a pregação está no canal da igreja, abra o YouTube Studio, vá em Conteúdo, clique nos três pontos do vídeo
            e escolha Baixar. Ou peça o arquivo à equipe de mídia: ele vem com a melhor qualidade. O vídeo é lido no seu
            computador e não é enviado para lugar nenhum.
          </p>
        </Disclosure>
      </div>

      <section className="mt-16">
        <h2 className="text-[17px] font-semibold">Como funciona</h2>
        <ol className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            ["Encontra os rostos", "O site olha o vídeo inteiro e acha todas as pessoas."],
            ["Marca o pregador", "Quem mais aparece em destaque já vem selecionado."],
            ["Separa as melhores", "Nítidas, de frente, eretas e de olhos abertos. Em PNG e no recorte 4:5."],
          ].map(([t, d], i) => (
            <Card key={t} className="flex gap-4 p-5">
              <span className="title text-[32px] text-blue">{i + 1}</span>
              <span>
                <span className="block text-[15px] font-semibold">{t}</span>
                <span className="mt-1 block text-[14px] text-ink-2">{d}</span>
              </span>
            </Card>
          ))}
        </ol>
      </section>
    </>
  );
});

const INTERVALS = [0.5, 1, 2, 3];

/** Campos de ajuste. `showInterval` some depois da analise (nao muda mais nada). */
export function SettingsFields({
  settings,
  onSettings,
  showInterval = true,
}: {
  settings: ScanSettings;
  onSettings: (s: ScanSettings) => void;
  showInterval?: boolean;
}) {
  return (
    <div className={`grid gap-8 ${showInterval ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
      {showInterval && (
        <div>
          <Segmented
            label="Olhar um quadro a cada"
            options={INTERVALS}
            value={settings.interval}
            onChange={(interval) => onSettings({ ...settings, interval })}
            format={(v) => `${String(v).replace(".", ",")} s`}
          />
          <p className="mt-2 text-[12px] leading-[1.33] text-ink-2">Menor fica mais preciso e demora mais.</p>
        </div>
      )}
      <Slider label="Quantidade de fotos" value={settings.count} min={4} max={30} unit="fotos" onChange={(count) => onSettings({ ...settings, count })} />
      <Slider label="Distância mínima entre fotos" value={settings.minGap} min={2} max={30} unit="s" onChange={(minGap) => onSettings({ ...settings, minGap })} />
    </div>
  );
}
