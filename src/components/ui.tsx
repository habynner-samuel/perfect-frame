"use client";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "outline" | "quiet" | "dark";

/** Botoes em pilula, como os da Apple. */
export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-full font-normal transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue disabled:pointer-events-none disabled:opacity-40 cursor-pointer whitespace-nowrap";
  const sizes = { sm: "min-h-[30px] px-3.5 text-[14px]", md: "min-h-[40px] px-[18px] text-[17px]" };
  const styles: Record<Variant, string> = {
    primary: "bg-blue text-white hover:bg-blue-hover",
    dark: "bg-ink text-white hover:bg-[#333336]",
    outline: "border border-blue text-blue hover:bg-blue hover:text-white",
    quiet: "text-link hover:underline",
  };
  return (
    <button className={`${base} ${sizes[size]} ${styles[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

/** Titulo de secao no padrao da Apple: frase em preto + continuacao em cinza. */
export function SectionTitle({ title, tail, className = "" }: { title: string; tail?: string; className?: string }) {
  return (
    <h2 className={`headline text-[28px] ${className}`}>
      {title}
      {tail && <span className="text-ink-2"> {tail}</span>}
    </h2>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[18px] bg-surface shadow-[var(--shadow-card)] ${className}`}>{children}</div>;
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 whitespace-nowrap ${className}`}>
      <svg width="20" height="20" viewBox="0 0 64 64" aria-hidden>
        <path d="M6 22V6h16M42 6h16v16M58 42v16H42M22 58H6V42" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="32" cy="25" r="7" fill="currentColor" />
        <path d="M18 47c1.5-7 7-11 14-11s12.5 4 14 11z" fill="currentColor" />
      </svg>
      <span className="text-[17px] font-semibold tracking-[-0.01em]">Frame do Pregador</span>
    </span>
  );
}

export function Slider({
  label, value, min, max, unit, onChange,
}: {
  label: string; value: number; min: number; max: number; unit: string; onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[14px] text-ink">{label}</span>
        <span className="text-[14px] tabular-nums text-ink-2">
          {value} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ["--fill-pct" as string]: `${pct}%` }}
        className="mt-3"
      />
    </div>
  );
}

/** Controle segmentado no estilo do macOS/iOS. */
export function Segmented<T extends string | number>({
  label, options, value, onChange, format,
}: {
  label: string; options: T[]; value: T; onChange: (v: T) => void; format: (v: T) => string;
}) {
  return (
    <div>
      <span className="text-[14px] text-ink">{label}</span>
      <div
        className="mt-2 grid rounded-[9px] bg-fill p-[2px]"
        style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}
        role="radiogroup"
        aria-label={label}
      >
        {options.map((o) => (
          <button
            key={String(o)}
            role="radio"
            aria-checked={value === o}
            onClick={() => onChange(o)}
            className={`h-7 cursor-pointer rounded-[7px] text-[13px] tabular-nums transition-colors duration-150 ${
              value === o ? "bg-surface font-medium text-ink shadow-[0_3px_8px_rgba(0,0,0,0.12),0_3px_1px_rgba(0,0,0,0.04)]" : "text-ink hover:bg-white/50"
            }`}
          >
            {format(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

type IconName = "download" | "zip" | "upload" | "close" | "check" | "chevron" | "back" | "frame" | "layers" | "clock" | "info" | "refresh";

/** Icones de traco fino, como os SF Symbols. */
export function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  const common = {
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
  };
  switch (name) {
    case "download":
      return <svg {...common}><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" /></svg>;
    case "zip":
      return <svg {...common}><path d="M6.5 3.5h7l4 4v13h-11z" /><path d="M13.5 3.5v4h4M10 7h1M10 10h1M10 13h1M9.5 16h2v2.5h-2z" /></svg>;
    case "upload":
      return <svg {...common}><path d="M12 16V5M7.5 9.5 12 5l4.5 4.5M5 19.5h14" /></svg>;
    case "close":
      return <svg {...common}><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></svg>;
    case "check":
      return <svg {...common}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
    case "chevron":
      return <svg {...common}><path d="M9.5 5.5 16 12l-6.5 6.5" /></svg>;
    case "back":
      return <svg {...common}><path d="M14.5 5.5 8 12l6.5 6.5" /></svg>;
    case "frame":
      return <svg {...common}><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /><circle cx="12" cy="12" r="2.5" /></svg>;
    case "layers":
      return <svg {...common}><path d="M12 4 3 9l9 5 9-5z" /><path d="M3 14l9 5 9-5" /></svg>;
    case "clock":
      return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>;
    case "info":
      return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 7.8v.2" /></svg>;
    case "refresh":
      return <svg {...common}><path d="M19.5 11A7.5 7.5 0 1 0 17.3 16.3" /><path d="M19.5 5v6h-6" /></svg>;
  }
}
