import type { Metadata, Viewport } from "next";
import { Anton, Inter } from "next/font/google";
import "./globals.css";

// No Mac e no iPhone o texto usa a fonte do sistema (SF Pro, a mesma da Apple).
// No Windows, a Inter entra no lugar, por ser a mais parecida.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
// Titulos: Anton, condensada e pesada, como nos sites do Habynner (Havock/Anton).
const anton = Anton({ subsets: ["latin"], weight: "400", variable: "--font-anton", display: "swap" });

export const metadata: Metadata = {
  title: "Frame do Pregador",
  description:
    "Escolha o vídeo da pregação e receba os frames com a melhor pose do pregador, prontos para a arte. Tudo roda no seu navegador.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#000000" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${anton.variable}`}>
      <body>{children}</body>
    </html>
  );
}
