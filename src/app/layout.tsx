import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Antes se cargaba con @import en globals.css (pide la fuente a Google en el
// momento y el texto arranca con una tipografía de reemplazo hasta que llega
// la real). Con next/font, Next la descarga en el build y la sirve desde el
// propio dominio — sin ese salto de tipografía al cargar la página.
const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "BOS · KMA Consultores",
  description: "Baires Outsourcing System — Módulo de Sueldos",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${inter.className} antialiased`}>{children}</body>
    </html>
  );
}
