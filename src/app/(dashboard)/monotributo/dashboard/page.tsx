import { getMesTrabajoActual, MESES_NOMBRES } from "@/lib/vencimientos";
import { TrendingUp } from "lucide-react";
import clsx from "clsx";
import Link from "next/link";
import { getCurrentLiquidadora } from "@/lib/auth";
import { BackupButton } from "@/components/BackupButton";
import { GuardarBackupStorageButton } from "@/components/GuardarBackupStorageButton";
import { DescargarExcelButton } from "@/components/DescargarExcelButton";
import { ESTADOS_MES, ESTADO_MES_LABEL, contarGestionados, hoyArgentina, type EstadoMes } from "@/lib/monotributo";
import { resumenControlEnCurso } from "@/lib/monotributoFacturacionServer";
import { armarTableroMonotributo, type Conteo } from "@/lib/monotributoTablero";
import { FiltrosTablero } from "./FiltrosTablero";
import { createAdminClient } from "@/lib/supabase/admin";
import { arrastrarMes } from "@/lib/monotributoServer";
import { enVentanaRecategorizacion, leerCalendario } from "@/lib/calendarioArca";


const COLOR_ESTADO: Record<EstadoMes, string> = {
  pendiente: "text-gray-500",
  vep_generado: "text-sky-600",
  en_borrador: "text-indigo-600",
  enviado: "text-blue-600",
  avisado: "text-violet-600",
  pagado: "text-emerald-600",
  no_pago: "text-red-600",
};

/** Meses para el selector: los 2 próximos y los 12 anteriores al mes de trabajo. */
function generarOpciones(mesActual: number, anioActual: number) {
  const result: { mes: number; anio: number }[] = [];
  let m = mesActual + 2;
  let a = anioActual;
  while (m > 12) { m -= 12; a++; }
  for (let i = 0; i < 15; i++) {
    result.push({ mes: m, anio: a });
    m--;
    if (m === 0) { m = 12; a--; }
  }
  return result;
}

function fmtFecha(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function fmtPesos(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

// Siempre datos frescos: un cambio (estado, deuda, etc.) se ve al instante, sin caché del servidor.
export const dynamic = "force-dynamic";

export default async function MonotributoDashboardPage({
  searchParams,
}: {
  searchParams: { mes?: string; anio?: string; resp?: string };
}) {
  const inicio = Date.now();
  const { mes: mesDefault, anio: anioDefault } = getMesTrabajoActual();
  const mes = Number(searchParams.mes) || mesDefault;
  const anio = Number(searchParams.anio) || anioDefault;
  const resp = searchParams.resp ?? "";
  const calendario = await leerCalendario([anio]);
  const esRecategorizacion = enVentanaRecategorizacion(calendario, anio, mes);

  try {
    await arrastrarMes(createAdminClient(), anio, mes, esRecategorizacion);
  } catch {
    // Si falla, el mes se muestra sin lo arrastrado.
  }
  const [yo, t, fact] = await Promise.all([getCurrentLiquidadora(), armarTableroMonotributo(anio, mes, resp || null), resumenControlEnCurso(createAdminClient(), hoyArgentina())]);

  // Lo nuestro es enviar el VEP/QR y avisar: el avance es "gestionados" (Enviado + Avisado + Pagado). Pagado y No pagó son informativos.
  const gestionados = contarGestionados(t.estados);
  const pctGestionados = t.total > 0 ? Math.round((gestionados / t.total) * 100) : 0;
  const dias = t.diasAlVencimiento;
  const exportHref = `/api/exportar/monotributo?mes=${mes}&anio=${anio}${resp ? `&resp=${encodeURIComponent(resp)}` : ""}`;

  // Tiempo de armado en el servidor (se ve en los registros de Vercel).
  console.info(`[tiempo] /monotributo/dashboard ${Date.now() - inicio} ms`);
  return (
    <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mb-1">Monotributo</p>
          <h1 className="text-[20px] font-semibold text-gray-900">
            Dashboard — {MESES_NOMBRES[mes]} {anio}
            {t.respFiltroNombre && <span className="text-gray-400 font-normal"> · {t.respFiltroNombre}</span>}
          </h1>
          {esRecategorizacion && (
            <span className="inline-block mt-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">
              Mes de recategorización
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <FiltrosTablero opciones={generarOpciones(mesDefault, anioDefault)} mes={mes} anio={anio} resp={resp} responsables={t.responsables} />
          <DescargarExcelButton href={exportHref} />
          {yo?.isAdmin && <BackupButton modulo="monotributo" />}
          {yo?.isAdmin && <GuardarBackupStorageButton modulo="monotributo" />}
        </div>
      </div>

      {yo && !yo.esCobranzas && !yo.esAdministrativo && yo.rol !== "viewer" && t.avisoCalendario && (
        <Link href="/monotributo/calendario" className="block mb-4 text-[12.5px] bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-2.5 hover:bg-amber-100">
          {t.avisoCalendario} Cargarlo →
        </Link>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Tarjeta titulo="Clientes activos">
          <p className="text-[28px] font-bold leading-none text-gray-900">{t.total}</p>
        </Tarjeta>
        <Tarjeta titulo="Gestionados" icono={<TrendingUp size={16} className="text-amber-500" />}>
          <p className={clsx("text-[28px] font-bold leading-none", pctGestionados === 100 ? "text-emerald-600" : "text-amber-600")}>
            {gestionados} <span className="text-[14px] font-medium text-gray-400">de {t.total}</span>
          </p>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className={clsx("h-full rounded-full", pctGestionados === 100 ? "bg-emerald-500" : "bg-amber-400")} style={{ width: `${pctGestionados}%` }} />
            </div>
            <span className="text-[11px] text-gray-500 font-semibold">{pctGestionados}%</span>
          </div>
          <p className="text-[10.5px] text-gray-400 mt-1">Enviado + Avisado + Pagado</p>
        </Tarjeta>
        <Tarjeta titulo="Sin gestionar">
          <p className={clsx("text-[28px] font-bold leading-none", t.total - gestionados - t.estados.no_pago > 0 ? "text-gray-900" : "text-emerald-600")}>
            {t.estados.pendiente + t.estados.vep_generado + t.estados.en_borrador}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">Pendiente, VEP generado o En borrador</p>
        </Tarjeta>
        {esRecategorizacion ? (
          <Tarjeta titulo="Recategorización">
            <p className="text-[28px] font-bold leading-none text-amber-600">{t.recategorizacion.realizadas}</p>
            <p className="text-[11px] text-gray-400 mt-1">{t.recategorizacion.pendientes} pendientes · cuota vence el {fmtFecha(t.vencimiento)}</p>
          </Tarjeta>
        ) : (
          <Tarjeta titulo="Vencimiento cuota">
            <p className={clsx("text-[28px] font-bold leading-none", dias < 0 ? "text-gray-400" : dias <= 3 ? "text-red-600" : "text-gray-900")}>
              {dias > 0 ? `${dias} días` : dias === 0 ? "Hoy" : "Vencido"}
            </p>
            <p className="text-[11px] text-gray-400 mt-1">
              {dias < 0 ? `venció el ${fmtFecha(t.vencimiento)} (hace ${-dias} días)` : `vence el ${fmtFecha(t.vencimiento)}`}
            </p>
          </Tarjeta>
        )}
      </div>

      {/* Avance del mes por estado */}
      <Bloque titulo="Avance del mes" subtitulo={`${MESES_NOMBRES[mes]} ${anio} · vence el ${fmtFecha(t.vencimiento)}${t.sinRegistro ? ` · ${t.sinRegistro} sin registro del mes cuentan como Pendiente` : ""}`}>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {ESTADOS_MES.map((e) => (
            <div key={e} className="rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2.5">
              <p className="text-[10.5px] font-semibold text-gray-400 uppercase tracking-wide">{ESTADO_MES_LABEL[e]}</p>
              <p className={clsx("text-[22px] font-bold leading-tight", t.estados[e] ? COLOR_ESTADO[e] : "text-gray-300")}>{t.estados[e]}</p>
            </div>
          ))}
        </div>
      </Bloque>

      {/* Datos a revisar */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-[14px] font-semibold text-gray-900">Datos a revisar</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {t.revisiones.total} marcas pendientes · <span className="text-red-600">{t.revisiones.rojo} en rojo</span> ·{" "}
              <span className="text-amber-700">{t.revisiones.amarillo} en amarillo</span>
            </p>
          </div>
          <Link href="/monotributo/revisar" className="text-[12px] font-medium text-amber-700 hover:text-amber-900">
            Ver la cola →
          </Link>
        </div>
        {t.revisiones.porResponsable.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {t.revisiones.porResponsable.map((r) => (
              <span key={r.nombre} className="text-[12px] bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1">
                <span className="font-medium text-gray-800">{r.nombre}</span>{" "}
                <span className="text-red-600">{r.rojo} rojas</span> / <span className="text-amber-700">{r.amarillo} amarillas</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Por responsable */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-[14px] font-semibold text-gray-900">Avance por responsable</h2>
          <p className="text-[11px] text-gray-400 mt-0.5">{MESES_NOMBRES[mes]} {anio}</p>
        </div>
        {t.porResponsable.length === 0 ? (
          <div className="py-12 text-center text-[13px] text-gray-400">Sin clientes</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap">
              <thead>
                <tr className="border-b border-gray-50 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  <th className="px-6 py-3 text-left">Responsable</th>
                  <th className="px-3 py-3 text-center">Total</th>
                  {ESTADOS_MES.map((e) => <th key={e} className="px-3 py-3 text-center">{ESTADO_MES_LABEL[e]}</th>)}
                  <th className="px-3 py-3 text-center">% gestionado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {t.porResponsable.map((r) => {
                  const pct = r.total > 0 ? Math.round((contarGestionados(r.estados) / r.total) * 100) : 0;
                  const sin = r.nombre === "Sin responsable";
                  return (
                    <tr key={r.nombre} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className={clsx("w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0",
                            sin ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700")}>
                            {sin ? "!" : r.nombre.charAt(0).toUpperCase()}
                          </div>
                          <span className={clsx("text-[13px] font-medium", sin ? "text-red-600" : "text-gray-800")}>{r.nombre}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center text-[13px] text-gray-700 font-medium">{r.total}</td>
                      {ESTADOS_MES.map((e) => (
                        <td key={e} className={clsx("px-3 py-3 text-center text-[12.5px]", r.estados[e] ? COLOR_ESTADO[e] : "text-gray-300")}>
                          {r.estados[e]}
                        </td>
                      ))}
                      <td className={clsx("px-3 py-3 text-center text-[12px] font-semibold",
                        pct === 100 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-gray-400")}>
                        {pct}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cartera */}
      {fact && (
        <Bloque titulo="Facturación" subtitulo={`Control de ${MESES_NOMBRES[fact.mes]} ${fact.anio} · últimos 12 meses`}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Mini label={`Cargados · ${pct(fact.cargados, fact.total)}`} valor={`${fact.cargados} de ${fact.total}`} color="text-gray-900" />
            <Mini label="Fichas enviadas" valor={fact.fichas_enviadas} color="text-gray-900" />
            <Mini label={`Cerca del tope (${fact.umbral}%)`} valor={fact.cerca_tope} color={fact.cerca_tope ? "text-amber-600" : "text-gray-300"} />
            <Mini label="Sobre el tope" valor={fact.sobre_tope} color={fact.sobre_tope ? "text-red-600" : "text-gray-300"} />
          </div>
          <Link href="/monotributo/facturacion" className="inline-block mt-3 text-[12px] text-bordo hover:underline">Ver Facturación →</Link>
        </Bloque>
      )}

      <Bloque titulo="Cartera" subtitulo="Clientes activos según la ficha de Monotributo">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          <Distribucion titulo="Forma de pago" datos={t.cartera.formaPago} total={t.total} alerta="Sin forma de pago" />
          <Distribucion titulo="Medio" datos={t.cartera.medio} total={t.total} alerta="Sin medio" />
          <Distribucion titulo="Envío" datos={t.cartera.envio} total={t.total} />
          {/* Categoría: se muestra recién cuando hay al menos una cargada. */}
          {t.conCategoria > 0 && (
            <Distribucion titulo={`Categoría · ${t.conCategoria} de ${t.total} con categoría`} datos={t.cartera.categoria} total={t.total} />
          )}
        </div>
      </Bloque>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Deuda */}
        <Bloque titulo="Deuda" subtitulo={`${MESES_NOMBRES[mes]} ${anio}`} sinMargen>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <Mini label="Con deuda" valor={t.deuda.conDeuda} color={t.deuda.conDeuda ? "text-red-600" : "text-gray-300"} />
            <Mini label="Sin deuda" valor={t.deuda.sinDeuda} color="text-emerald-600" />
            <Mini label="Sin verificar" valor={t.deuda.sinVerificar} color={t.deuda.sinVerificar ? "text-amber-600" : "text-gray-300"} />
          </div>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <Mini label={`Avisadas · ${pct(t.deuda.avisadas, t.deuda.registradas)}`} valor={t.deuda.avisadas} color="text-violet-600" />
            <Mini label={`Abonadas · ${pct(t.deuda.abonadas, t.deuda.registradas)}`} valor={t.deuda.abonadas} color="text-emerald-600" />
          </div>
          <p className="text-[11px] text-gray-400 -mt-2 mb-3">Sobre {t.deuda.registradas} deuda(s) registrada(s) en el mes (abonadas incluidas).</p>
          <div className="text-[12.5px] text-gray-600 space-y-1 mb-4">
            <p>
              Importe total cargado: <span className="font-semibold text-gray-900">{fmtPesos(t.deuda.importeTotal)}</span>
              <span className="text-gray-400"> (importe cargado en {t.deuda.conImporte} de {t.deuda.conDeuda})</span>
            </p>
            <p>
              Deuda avisada: <span className="font-semibold text-gray-900">{t.deuda.avisados}</span> · no avisada:{" "}
              <span className={clsx("font-semibold", t.deuda.noAvisados ? "text-red-600" : "text-gray-900")}>{t.deuda.noAvisados}</span>
            </p>
          </div>
          <Distribucion titulo="Intimaciones" datos={t.deuda.intimaciones} total={t.total} />
        </Bloque>

        {/* Automatización */}
        <Bloque titulo="Automatización" subtitulo="Cuánto trabajo manual hay detrás de cada mes" sinMargen>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
            <Mini label="Adheridos a débito o tarjeta" valor={`${t.automatizacion.adheridosDebito} · ${t.automatizacion.pctAdheridosDebito}%`} color="text-emerald-600" />
            <Mini label="Paga por su cuenta" valor={`${t.automatizacion.pagaPorSuCuenta} · ${t.automatizacion.pctPagaPorSuCuenta}%`} color="text-gray-900" />
            <Mini label="Sin envío mensual (total)" valor={`${t.automatizacion.pctSinEnvio}%`} color="text-emerald-600" />
            <Mini label="Envíos VEP/QR por mes" valor={t.automatizacion.enviosVep} color="text-gray-900" />
            <Mini label="Destinatarios de VEP/QR" valor={t.automatizacion.destinatariosVep} color="text-gray-900" />
            <Mini label="Destinatarios de aviso" valor={t.automatizacion.destinatariosAviso} color="text-gray-900" />
          </div>
          <p className="text-[12px] text-gray-500 mb-3">
            {t.automatizacion.sinEnvio} de {t.total} clientes no requieren envío (débito automático, tarjeta o paga por su cuenta).{" "}
            {t.automatizacion.enviosVep} envíos de VEP/QR van a {t.automatizacion.destinatariosVep} destinatarios; {t.automatizacion.avisos} avisos van a {t.automatizacion.destinatariosAviso}.
          </p>
          {t.automatizacion.destinatariosCompartidos.length > 0 && (
            <>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Destinatarios de VEP/QR con varios clientes</p>
              <div className="space-y-1">
                {t.automatizacion.destinatariosCompartidos.map((d) => (
                  <div key={d.label} className="flex items-center justify-between gap-3 text-[12px]">
                    <span className="text-gray-700 truncate" title={d.label}>{d.label}</span>
                    <span className="font-semibold text-gray-900 shrink-0">{d.n} clientes</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Bloque>
      </div>
    </div>
  );
}

function Tarjeta({ titulo, icono, children }: { titulo: string; icono?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{titulo}</p>
        {icono}
      </div>
      {children}
    </div>
  );
}

function Bloque({ titulo, subtitulo, sinMargen, children }: { titulo: string; subtitulo?: string; sinMargen?: boolean; children: React.ReactNode }) {
  return (
    <div className={clsx("bg-white rounded-xl border border-gray-100 shadow-sm p-5", !sinMargen && "mb-6")}>
      <h2 className="text-[14px] font-semibold text-gray-900">{titulo}</h2>
      {subtitulo && <p className="text-[11px] text-gray-400 mt-0.5 mb-4">{subtitulo}</p>}
      {children}
    </div>
  );
}

function pct(n: number, total: number) {
  return total > 0 ? `${Math.round((n / total) * 100)}%` : "—";
}

function Mini({ label, valor, color }: { label: string; valor: number | string; color: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2.5">
      <p className="text-[10.5px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={clsx("text-[22px] font-bold leading-tight", color)}>{valor}</p>
    </div>
  );
}

function Distribucion({ titulo, datos, total, alerta, pie }: { titulo: string; datos: Conteo[]; total: number; alerta?: string; pie?: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">{titulo}</p>
      {datos.length === 0 ? (
        <p className="text-[12px] text-gray-400">Sin datos</p>
      ) : (
        <div className="space-y-1.5">
          {datos.map((d) => (
            <div key={d.label} className="flex items-center gap-2 text-[12px]">
              <span className={clsx("w-40 shrink-0 truncate", d.label === alerta ? "text-red-600 font-medium" : "text-gray-700")} title={d.label}>
                {d.label}
              </span>
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={clsx("h-full rounded-full", d.label === alerta ? "bg-red-400" : "bg-amber-400")} style={{ width: `${total ? (d.n / total) * 100 : 0}%` }} />
              </div>
              <span className="w-16 shrink-0 text-right text-gray-600">
                {d.n} <span className="text-gray-400">({total ? Math.round((d.n / total) * 100) : 0}%)</span>
              </span>
            </div>
          ))}
        </div>
      )}
      {pie && <p className="text-[11px] text-gray-400 mt-1.5">{pie}</p>}
    </div>
  );
}
