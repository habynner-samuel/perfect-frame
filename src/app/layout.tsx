import type { Metadata, Viewport } from "next";
import { Anton, Inter, Pinyon_Script } from "next/font/google";
import "./globals.css";

const anton = Anton({ subsets: ["latin"], weight: "400", variable: "--font-anton", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const script = Pinyon_Script({ subsets: ["latin"], weight: "400", variable: "--font-script", display: "swap" });

export const metadata: Metadata = {
  title: "Frame do Pregador",
  description:
    "Escolha o vídeo da pregação e receba os frames com a melhor pose do pregador, prontos para a arte. Tudo roda no seu navegador.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#0d0805" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${anton.variable} ${inter.variable} ${script.variable}`}>
      <body>{children}</body>
    </html>
  );
}
