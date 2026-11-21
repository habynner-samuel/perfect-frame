"use client";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "soft";

export function Button({
  variant = "primary",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:opacity-40 disabled:pointer-events-none cursor-pointer";
  const styles: Record<Variant, string> = {
    primary:
      "bg-ember-gradient text-[#1f0f05] px-6 h-12 text-[15px] shadow-[0_10px_30px_-10px_rgba(232,116,44,0.7)] hover:brightness-110 active:scale-[0.98]",
    ghost: "border border-line-strong text-cream px-5 h-11 text-sm hover:bg-white/5",
    soft: "bg-surface-3 text-cream px-4 h-10 text-sm hover:bg-[#3a281b]",
  };
  return (
    <button className={`${base} ${styles[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Pill({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface-2/80 px-3 py-1 text-xs font-medium text-muted ${className}`}
    >
      {children}
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative rounded-[28px] border border-line bg-surface ${className}`}>{children}</div>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <svg width="30" height="30" viewBox="0 0 64 64" aria-hidden>
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f8cd86" />
            <stop offset=".5" stopColor="#f2a54a" />
            <stop offset="1" stopColor="#e8742c" />
          </linearGradient>
        </defs>
        <path d="M14 22V14h8M42 14h8v8M50 42v8h-8M22 50h-8v-8" fill="none" stroke="url(#lg)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="32" cy="27" r="6.5" fill="url(#lg)" />
        <path d="M20 45c1.5-6.5 6.3-9.5 12-9.5s10.5 3 12 9.5" fill="url(#lg)" />
      </svg>
      <span className="font-display text-[19px] uppercase tracking-[0.04em] text-cream">Frame do Pregador</span>
    </span>
  );
}

export function Icon({ name, className = "h-4 w-4" }: { name: "download" | "zip" | "upload" | "close" | "lock" | "check" | "film" | "spark" | "back"; className?: string }) {
  const common = { className, fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, viewBox: "0 0 24 24", "aria-hidden": true };
  switch (name) {
    case "download":
      return <svg {...common}><path d="M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5M5 19h14" /></svg>;
    case "zip":
      return <svg {...common}><path d="M6 3h9l4 4v14H6z" /><path d="M11 3v2m0 2v2m0 2v2m-1 2h2v3h-2z" /></svg>;
    case "upload":
      return <svg {...common}><path d="M12 16V5m0 0-4.5 4.5M12 5l4.5 4.5M5 19h14" /></svg>;
    case "close":
      return <svg {...common}><path d="M6 6l12 12M18 6 6 18" /></svg>;
    case "lock":
      return <svg {...common}><rect x="5" y="11" width="14" height="9" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
    case "check":
      return <svg {...common}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
    case "film":
      return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M7 5v14M17 5v14M3 9.5h4M17 9.5h4M3 14.5h4M17 14.5h4" /></svg>;
    case "spark":
      return <svg {...common}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" /></svg>;
    case "back":
      return <svg {...common}><path d="M15 5l-7 7 7 7" /></svg>;
  }
}
