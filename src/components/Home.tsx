"use client";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import type { ScanSettings } from "@/lib/types";
import { InspectorSection, WorkHeader } from "./Shell";
import { Button, Card, Icon, Segmented, SectionTitle, Slider } from "./ui";

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
      <WorkHeader step={0} title="Melhores frames." subtitle="O pregador na melhor pose. Direto do vídeo do culto." />

      <div className="mt-10">
        {notice && (
          <div
            role={notice.kind === "error" ? "alert" : "status"}
            className={`mb-6 rounded-[12px] px-5 py-4 text-[14px] ${notice.kind === "error" ? "bg-[#fff0f0] text-red" : "bg-[#e8f2fd] text-ink"}`}
          >
            {notice.text}
          </div>
        )}

        <SectionTitle title="Escolha o vídeo." tail="Pode ser o culto inteiro." />

        <Card className="mt-5 overflow-hidden">
          <div
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files); }}
            className={`m-3 flex min-h-[320px] flex-col items-start justify-end rounded-[12px] border-2 border-dashed p-8 transition-colors duration-200 ${
              over ? "border-blue bg-[#e8f2fd]" : "border-hairline"
            }`}
          >
            <Icon name="upload" className="h-10 w-10 text-ink-2" />
            <p className="headline mt-6 text-[32px]">Arraste o arquivo para cá.</p>
            <p className="mt-2 text-[17px] text-ink-2">MP4, MOV ou WebM. O vídeo é lido aqui mesmo, sem upload.</p>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <Button onClick={open}>Escolher arquivo</Button>
            </div>
          </div>
          <input
            ref={input}
            type="file"
            accept="video/*,.mp4,.mov,.m4v,.webm,.mkv"
            className="hidden"
            onChange={(e) => { pick(e.target.files); e.target.value = ""; }}
          />
        </Card>

        <div className="mt-12">
          <SectionTitle title="Como funciona." tail="Três passos, sem complicação." />
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {[
              ["frame", "Encontra os rostos.", "O site olha o vídeo inteiro, quadro a quadro, e acha todas as pessoas."],
              ["check", "Marca o pregador.", "Quem mais aparece em destaque no vídeo já vem selecionado."],
              ["download", "Separa as melhores.", "Fotos nítidas, de frente e de olhos abertos. Em PNG e no recorte 4:5."],
            ].map(([icon, t, d]) => (
              <Card key={t} className="p-7">
                <Icon name={icon as "frame"} className="h-7 w-7 text-blue" />
                <p className="mt-8 text-[21px] font-semibold leading-tight tracking-[-0.01em]">{t}</p>
                <p className="mt-2 text-[17px] text-ink-2">{d}</p>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </>
  );
});

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
            label="Olhar um quadro a cada"
            options={INTERVALS}
            value={settings.interval}
            onChange={(interval) => onSettings({ ...settings, interval })}
            format={(v) => `${String(v).replace(".", ",")} s`}
          />
          <p className="-mt-2 text-[12px] leading-[1.33] text-ink-2">Menor fica mais preciso e demora mais.</p>
        </InspectorSection>
      )}
      <InspectorSection title="Fotos">
        <Slider label="Quantidade" value={settings.count} min={4} max={30} unit="fotos" onChange={(count) => onSettings({ ...settings, count })} />
        <Slider label="Distância mínima" value={settings.minGap} min={2} max={30} unit="s" onChange={(minGap) => onSettings({ ...settings, minGap })} />
      </InspectorSection>
    </>
  );
}
