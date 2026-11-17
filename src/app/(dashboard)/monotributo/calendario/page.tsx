import { redirect } from "next/navigation";
import { getCurrentLiquidadora } from "@/lib/auth";
import { hoyArgentina } from "@/lib/monotributo";
import { anioCargado, avisoCalendarioFaltante, leerCalendario, mesDe } from "@/lib/calendarioArca";
import { CalendarioClient } from "./CalendarioClient";

// Siempre datos frescos: un cambio (estado, deuda, etc.) se ve al instante, sin caché del servidor.
export const dynamic = "force-dynamic";

export default async function CalendarioArcaPage({ searchParams }: { searchParams: { anio?: string } }) {
  const yo = await getCurrentLiquidadora();
  if (!yo?.isAdmin) redirect("/monotributo");

  const hoy = hoyArgentina();
  const anioHoy = Number(hoy.slice(0, 4));
  const anio = Number(searchParams.anio) || anioHoy;
  const cal = await leerCalendario([anio, anio - 1, anioHoy, anioHoy + 1]);

  const filas = Array.from({ length: 12 }, (_, i) => mesDe(cal, anio, i + 1));
  const anterior = Array.from({ length: 12 }, (_, i) => mesDe(cal, anio - 1, i + 1)).filter((m) => m.cargado);

  return (
    <CalendarioClient
      anio={anio}
      anioHoy={anioHoy}
      filas={filas}
      cargado={anioCargado(cal, anio)}
      anterior={anterior}
      aviso={avisoCalendarioFaltante(cal, hoy)}
    />
  );
}
