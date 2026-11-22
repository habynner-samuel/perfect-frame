"use client";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import type { ScanSettings } from "@/lib/types";
import { InspectorSection, WorkHeader } from "./Shell";
import { Button, Icon, Segmented, Slider } from "./ui";

export interface ImportHandle {
  openPicker: () => void;
}

/** Etapa 1: escolher o video. */
export const ImportView = forwardRef<ImportHandle, {
  onFile: (f: File) => void;
  notice: { kind: "error" | "info"; text: string } | null;
}>(function ImportView({ onFile, notice }, ref) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const open = () => input.current?.click();
  useImperativeHandle(ref, () => ({ openPicker: open }));
  const pick = (files: FileList | null) => {
    const f = files?.[0];
    if (f) onFile(f);
  };

  return (
    <>
      <WorkHeader
        step={0}
        title="Melhores frames"
        subtitle="Encontra o pregador no vídeo do culto e separa os frames com a melhor pose, prontos para a arte."
      />
      <div className="px-6 py-6 lg:px-8">
        {notice && (
          <div
            role={notice.kind === "error" ? "alert" : "status"}
            className={`mb-5 border-l-2 px-4 py-3 text-[14px] ${notice.kind === "error" ? "border-danger bg-danger/10" : "border-cyan bg-cyan/10"}`}
          >
            {notice.text}
          </div>
        )}

        <div
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files); }}
          className={`flex min-h-[300px] flex-col justify-between rounded-[4px] border border-dashed p-6 transition-colors duration-150 sm:p-8 ${
            over ? "border-cyan bg-cyan/5" : "border-line-strong bg-panel"
          }`}
        >
          <div className="flex items-start gap-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center border border-line-strong text-white">
              <Icon name="upload" className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-[20px] font-semibold leading-tight">Arraste o vídeo da pregação para cá</h2>
              <p className="mt-1 text-[15px] text-mist">MP4, MOV ou WebM. Pode ser o culto inteiro.</p>
            </div>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button onClick={open}>
              <Icon name="upload" /> Escolher arquivo
            </Button>
            <span className="text-[13px] text-faint">O arquivo é lido aqui mesmo, sem upload.</span>
          </div>
          <input
            ref={input}
            type="file"
            accept="video/*,.mp4,.mov,.m4v,.webm,.mkv"
            className="hidden"
            onChange={(e) => { pick(e.target.files); e.target.value = ""; }}
          />
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <Tip title="Só tem o link do YouTube?">
            Se a pregação está no canal da igreja, abra o YouTube Studio, vá em Conteúdo, clique nos três pontos do
            vídeo e escolha Baixar. Ou peça o arquivo à equipe de mídia: ele vem com a melhor qualidade.
          </Tip>
          <Tip title="O que você recebe">
            As pessoas que aparecem no vídeo, com o provável pregador já marcado, e as melhores fotos dele em PNG,
            inteiras e no recorte vertical 4:5.
          </Tip>
        </div>
      </div>
    </>
  );
});

function Tip({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[4px] border border-line p-5">
      <p className="flex items-center gap-2 text-[14px] font-semibold">
        <Icon name="info" className="h-4 w-4 text-cyan" /> {title}
      </p>
      <p className="mt-2 text-[14px] leading-relaxed text-mist">{children}</p>
    </div>
  );
}

const INTERVALS = [0.5, 1, 2, 3];

/** Painel de ajustes da analise. */
export function SettingsPanel({
  settings,
  onSettings,
  showInterval = true,
}: {
  settings: ScanSettings;
  onSettings: (s: ScanSettings) => void;
  showInterval?: boolean;
}) {
  return (
    <>
      {showInterval && (
        <InspectorSection title="Análise">
          <Segmented
            label="Olhar um frame a cada"
            options={INTERVALS}
            value={settings.interval}
            onChange={(interval) => onSettings({ ...settings, interval })}
            format={(v) => `${String(v).replace(".", ",")} s`}
          />
          <p className="-mt-2 text-[12px] text-faint">Menor fica mais preciso e demora mais.</p>
        </InspectorSection>
      )}
      <InspectorSection title="Fotos">
        <Slider label="Quantidade" value={settings.count} min={4} max={30} unit="fotos" onChange={(count) => onSettings({ ...settings, count })} />
        <Slider label="Distância mínima" value={settings.minGap} min={2} max={30} unit="s" onChange={(minGap) => onSettings({ ...settings, minGap })} />
      </InspectorSection>
    </>
  );
}
