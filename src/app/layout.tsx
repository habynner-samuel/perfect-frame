import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import "./globals.css";

const condensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-barlow-condensed",
  display: "swap",
});
const barlow = Barlow({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-barlow", display: "swap" });

export const metadata: Metadata = {
  title: "Frame do Pregador",
  description:
    "Escolha o vídeo da pregação e receba os frames com a melhor pose do pregador, prontos para a arte. Tudo roda no seu navegador.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#020a18" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${condensed.variable} ${barlow.variable}`}>
      <body>{children}</body>
    </html>
  );
}
