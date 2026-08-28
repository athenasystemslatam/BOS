import type { Metadata } from "next";
import "./globals.css";

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
      <body className="antialiased">{children}</body>
    </html>
  );
}
