"use client";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "outline" | "quiet";

/** Botoes retangulares de 44 px (altura de toque da Apple), cantos quase retos. */
export function Button({
  variant = "primary",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const base =
    "inline-flex h-11 items-center justify-center gap-2 rounded-[3px] px-5 font-display text-[15px] font-semibold uppercase tracking-[0.12em] transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan disabled:pointer-events-none disabled:opacity-40 cursor-pointer";
  const styles: Record<Variant, string> = {
    primary: "bg-cyan text-abyss hover:bg-cyan-hover",
    outline: "border border-white/70 text-white hover:bg-white hover:text-abyss",
    quiet: "border border-line-strong text-white hover:border-white",
  };
  return (
    <button className={`${base} ${styles[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

/** Link de texto no estilo "Saiba mais >" da Apple. */
export function TextLink({ children, href, onClick }: { children: ReactNode; href?: string; onClick?: () => void }) {
  return (
    <a
      href={href}
      onClick={onClick}
      className="inline-flex cursor-pointer items-center gap-1 text-[17px] text-cyan hover:underline underline-offset-4"
    >
      {children}
      <Icon name="chevron" className="h-3.5 w-3.5" />
    </a>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[4px] border border-line bg-panel ${className}`}>{children}</div>;
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display text-[19px] font-bold uppercase leading-none tracking-[0.06em] text-white ${className}`}>
      Frame<span className="font-medium text-mist"> do </span>Pregador
    </span>
  );
}

type IconName = "download" | "zip" | "upload" | "close" | "check" | "chevron" | "back";

/** Icones de traco fino, pontas retas. */
export function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  const common = {
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
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
  }
}
