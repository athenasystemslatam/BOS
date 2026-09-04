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
  // El celular (sobre todo Safari/iPhone) detecta automáticamente números
  // que "parecen" teléfono, fecha, dirección o email en cualquier texto de
  // la pantalla y los convierte en link — sin que el código los arme como
  // tal. Con muchas claves numéricas (PINs, claves fiscales), eso las hacía
  // ver como hipervínculo al visualizarlas. Se apaga esa detección acá.
  formatDetection: {
    telephone: false,
    date: false,
    address: false,
    email: false,
  },
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
