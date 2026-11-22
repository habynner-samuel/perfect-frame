"use client";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "outline" | "quiet";

/** Botoes retangulares, cantos quase retos. Altura 40 px (sm 32 px). */
export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-[3px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan disabled:pointer-events-none disabled:opacity-40 cursor-pointer whitespace-nowrap";
  const sizes = { sm: "h-8 px-3 text-[13px]", md: "h-10 px-4 text-[14px]" };
  const styles: Record<Variant, string> = {
    primary: "bg-cyan text-abyss hover:bg-cyan-hover",
    outline: "border border-line-strong text-white hover:border-white/70 hover:bg-white/5",
    quiet: "text-mist hover:bg-white/5 hover:text-white",
  };
  return (
    <button className={`${base} ${sizes[size]} ${styles[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

/** Titulo de secao de painel: pequeno, caixa alta, espacado. */
export function SectionLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`eyebrow text-[11px] text-faint ${className}`}>{children}</p>;
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <svg width="18" height="18" viewBox="0 0 64 64" aria-hidden>
        <path d="M6 22V6h16M42 6h16v16M58 42v16H42M22 58H6V42" fill="none" stroke="var(--cyan)" strokeWidth="7" strokeLinecap="square" />
        <rect x="26" y="20" width="12" height="12" fill="var(--white)" />
        <path d="M18 46v-3c0-4 3-7 7-7h14c4 0 7 3 7 7v3z" fill="var(--white)" />
      </svg>
      <span className="whitespace-nowrap font-display text-[17px] font-bold uppercase leading-none tracking-[0.06em] text-white">
        Frame<span className="font-medium text-mist"> do </span>Pregador
      </span>
    </span>
  );
}

export function Slider({
  label, value, min, max, unit, onChange,
}: {
  label: string; value: number; min: number; max: number; unit: string; onChange: (v: number) => void;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[14px] text-mist">{label}</span>
        <span className="text-[14px] font-medium tabular-nums text-white">
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
        style={{ ["--fill" as string]: `${fill}%` }}
        className="mt-3"
      />
    </div>
  );
}

export function Segmented<T extends string | number>({
  label, options, value, onChange, format,
}: {
  label: string; options: T[]; value: T; onChange: (v: T) => void; format: (v: T) => string;
}) {
  return (
    <div>
      <span className="text-[14px] text-mist">{label}</span>
      <div className="mt-2 grid border border-line-strong" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }} role="radiogroup" aria-label={label}>
        {options.map((o, i) => (
          <button
            key={String(o)}
            role="radio"
            aria-checked={value === o}
            onClick={() => onChange(o)}
            className={`h-8 cursor-pointer text-[13px] font-medium tabular-nums transition-colors duration-150 ${i ? "border-l border-line-strong" : ""} ${
              value === o ? "bg-white text-abyss" : "text-mist hover:text-white"
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

/** Icones de traco fino, pontas retas. */
export function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  const common = {
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "square" as const,
    strokeLinejoin: "miter" as const,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
  };
  switch (name) {
    case "download":
      return <svg {...common}><path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" /></svg>;
    case "zip":
      return <svg {...common}><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M10 7h1M10 10h1M10 13h1M9.5 16h2v3h-2z" /></svg>;
    case "upload":
      return <svg {...common}><path d="M12 16V5M7 9.5l5-5 5 5M5 20h14" /></svg>;
    case "close":
      return <svg {...common}><path d="M6 6l12 12M18 6 6 18" /></svg>;
    case "check":
      return <svg {...common}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
    case "chevron":
      return <svg {...common}><path d="M9 5l7 7-7 7" /></svg>;
    case "back":
      return <svg {...common}><path d="M15 5l-7 7 7 7" /></svg>;
    case "frame":
      return <svg {...common}><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /><path d="M9 9h6v6H9z" /></svg>;
    case "layers":
      return <svg {...common}><path d="M12 4 3 9l9 5 9-5z" /><path d="M3 14l9 5 9-5" /></svg>;
    case "clock":
      return <svg {...common}><path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" /><path d="M12 7v5l3 2" /></svg>;
    case "info":
      return <svg {...common}><path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" /><path d="M12 11v6M12 7.5v.5" /></svg>;
    case "refresh":
      return <svg {...common}><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 5v6h-6" /></svg>;
  }
}
