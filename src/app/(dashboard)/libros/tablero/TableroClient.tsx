"use client";

import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { HelpCircle } from "lucide-react";
import { PRIORIDAD_INFO, diasHasta, fmtFecha, textoPeriodos } from "@/lib/libros";
import type { EnvioAnual, LibroAtraso } from "@/lib/librosTablero";
import type { PrioridadLibro } from "@/types";
import {
  BOTON_SECUNDARIO,
  CHIP,
  ENCABEZADO,
  MONO,
  NUM,
  PAGINA,
  PANEL,
  PANEL_CABECERA,
  RAYA_MODULO,
  SEMAFORO,
  TH,
  TITULO,
} from "../ui";

type MandatoFila = { clienteId: string; nombre: string; vence: string; dias: number };

export type DatosTablero = {
  hoy: string;
  fechaMeta: string | null;
  tablaSnapshots: boolean;
  esAdmin: boolean;
  base: { fecha: string; periodos: number; alDia: number; atrasados: number };
  actual: {
    periodos: number;
    alDia: number;
    atrasados: number;
    sinDato: number;
    sinLibro: number;
    sinCargar: number;
    total: number;
  };
  masAtrasados: LibroAtraso[];
  logrado: {
    puestos: { semana: number; mes: number; total: number };
    envios: { semana: number; mes: number; total: number };
  };
  evolucion: { semana: string; fecha: string; periodos: number; atrasados: number }[];
  envios: { completos: number; total: number; pendientes: EnvioAnual[] };
  prioridad: { prioridad: PrioridadLibro; abiertas: number; antiguedad: number | null }[];
  mandatos: {
    vigentes: number;
    porVencer: MandatoFila[];
    vencidos: MandatoFila[];
    sinCargar: { clienteId: string; nombre: string }[];
  };
  porResponsable:
    | {
        id: string;
        nombre: string;
        libros: number;
        periodosBase: number;
        periodosHoy: number;
        alDia: number;
        sinDato: number;
        puestosAlDia: number;
      }[]
    | null;
};

const CIFRA = "font-archivo font-extrabold tracking-tight text-ink tabular-nums";
const ETIQUETA = "text-[10.5px] font-semibold text-ink-subtle uppercase tracking-[0.08em]";

function pct(parte: number, total: number): string {
  return total ? `${Math.round((parte / total) * 100)}%` : "—";
}

function Seccion({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <section className={clsx(PANEL, "overflow-hidden")}>
      <div className={clsx(PANEL_CABECERA, "px-4 py-2.5 flex items-center gap-2")}>
        <h2 className="font-archivo text-[14px] font-bold text-ink">{titulo}</h2>
        {ayuda && (
          <span title={ayuda} aria-label={ayuda} className="text-ink-subtle">
            <HelpCircle size={13} />
          </span>
        )}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Dato({ etiqueta, valor, detalle, cls }: { etiqueta: string; valor: string | number; detalle?: string; cls?: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className={ETIQUETA}>{etiqueta}</span>
      <span className={clsx(CIFRA, "text-[22px]", cls)}>{valor}</span>
      {detalle && <span className="text-[12px] text-ink-muted">{detalle}</span>}
    </div>
  );
}

// Una serie (períodos pendientes por semana): línea de 2px en bordo, marcadores
// de 8px, grilla recesiva, etiqueta directa en el último punto y tooltip.
function Evolucion({ puntos }: { puntos: DatosTablero["evolucion"] }) {
  const [activo, setActivo] = useState<number | null>(null);
  const W = 640;
  const H = 200;
  const M = { izq: 44, der: 56, arr: 16, aba: 28 };
  const max = Math.max(1, ...puntos.map((p) => p.periodos));
  const tope = Math.ceil(max / 10) * 10 || 10;
  const x = (i: number) => M.izq + (puntos.length === 1 ? 0 : (i * (W - M.izq - M.der)) / (puntos.length - 1));
  const y = (v: number) => M.arr + (1 - v / tope) * (H - M.arr - M.aba);
  const ultimo = puntos.length - 1;

  return (
    <div className="space-y-2">
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Evolución semanal de los períodos pendientes">
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={M.izq} x2={W - M.der} y1={y(tope * f)} y2={y(tope * f)} stroke="#EFEBE4" strokeWidth={1} />
              <text x={M.izq - 8} y={y(tope * f) + 4} textAnchor="end" fontSize={11} fill="#7C756E" className="font-plex">
                {Math.round(tope * f)}
              </text>
            </g>
          ))}
          <polyline
            points={puntos.map((p, i) => `${x(i)},${y(p.periodos)}`).join(" ")}
            fill="none"
            stroke="#7D1C2E"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {puntos.map((p, i) => (
            <g key={p.semana}>
              <circle cx={x(i)} cy={y(p.periodos)} r={activo === i ? 5 : 4} fill="#7D1C2E" stroke="#FCFBF9" strokeWidth={2} />
              <text x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="#7C756E" className="font-plex">
                {fmtFecha(p.fecha).slice(0, 5)}
              </text>
              <rect
                x={x(i) - 24}
                y={M.arr}
                width={48}
                height={H - M.arr - M.aba}
                fill="transparent"
                onMouseEnter={() => setActivo(i)}
                onMouseLeave={() => setActivo(null)}
              />
            </g>
          ))}
          {puntos.length > 0 && (
            <text x={x(ultimo) + 10} y={y(puntos[ultimo].periodos) + 4} fontSize={12} fontWeight={600} fill="#17141A" className="font-plex">
              {puntos[ultimo].periodos}
            </text>
          )}
        </svg>
        {activo != null && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg bg-ink px-2.5 py-1.5 text-[11.5px] text-white shadow"
            style={{ left: `${(x(activo) / W) * 100}%`, top: `${(y(puntos[activo].periodos) / H) * 100}%` }}
          >
            <p className={MONO}>{fmtFecha(puntos[activo].fecha)}</p>
            <p>
              <span className={MONO}>{puntos[activo].periodos}</span> períodos ·{" "}
              <span className={MONO}>{puntos[activo].atrasados}</span> libros atrasados
            </p>
          </div>
        )}
      </div>
      <details className="text-[12px] text-ink-muted">
        <summary className="cursor-pointer select-none">Ver como tabla</summary>
        <table className="mt-2 w-full max-w-sm text-[12px]">
          <thead>
            <tr>
              <th className={clsx(TH, "text-left px-0")}>Semana</th>
              <th className={clsx(TH, "text-right")}>Períodos</th>
              <th className={clsx(TH, "text-right")}>Libros atrasados</th>
            </tr>
          </thead>
          <tbody>
            {puntos.map((p) => (
              <tr key={p.semana} className="border-t border-line-row">
                <td className={clsx(NUM, "text-left py-1")}>{fmtFecha(p.fecha)}</td>
                <td className={clsx(NUM, "px-3")}>{p.periodos}</td>
                <td className={clsx(NUM, "px-3")}>{p.atrasados}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function ListaClientes({ filas, vacio }: { filas: { clienteId: string; nombre: string; extra?: React.ReactNode }[]; vacio: string }) {
  if (filas.length === 0) return <p className="text-[12.5px] text-ink-subtle">{vacio}</p>;
  return (
    <ul className="divide-y divide-line-row">
      {filas.slice(0, 8).map((f) => (
        <li key={f.clienteId} className="flex items-baseline justify-between gap-3 py-1.5">
          <Link href={`/libros/clientes/${f.clienteId}`} className="text-[12.5px] text-ink hover:text-bordo truncate">
            {f.nombre}
          </Link>
          {f.extra}
        </li>
      ))}
      {filas.length > 8 && <li className="pt-1.5 text-[12px] text-ink-subtle">y {filas.length - 8} más</li>}
    </ul>
  );
}

export function TableroClient({ datos }: { datos: DatosTablero }) {
  const { base, actual, logrado, envios, mandatos } = datos;
  const reduccion = base.periodos - actual.periodos;
  const diasMeta = datos.fechaMeta ? diasHasta(datos.fechaMeta) : null;
  const semanasMeta = diasMeta != null && diasMeta > 0 ? Math.ceil(diasMeta / 7) : null;
  const semanasDesdeBase = Math.max(1, Math.round(-diasHasta(base.fecha) / 7));
  const ritmoActual = reduccion > 0 ? Math.round((reduccion / semanasDesdeBase) * 10) / 10 : 0;

  return (
    <div className={PAGINA}>
      <div className={ENCABEZADO}>
        <span className={RAYA_MODULO} />
        <h1 className={TITULO}>Tablero</h1>
        <span className={clsx(MONO, "text-[12px] text-ink-subtle")}>al {fmtFecha(datos.hoy)}</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 pb-8 space-y-4">
        {!datos.tablaSnapshots && (
          <p className="text-[12px] text-ink-muted">
            La evolución semanal se empieza a guardar cuando se corre <span className={MONO}>add_libros_etapa7.sql</span>.
          </p>
        )}

        {/* 1. Objetivos */}
        <div className="grid gap-4 md:grid-cols-2">
          <Seccion titulo="Puesta al día: atraso a 0" ayuda="Períodos que faltan copiar para que todos los libros lleguen a lo exigible hoy.">
            <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
              <Dato etiqueta="Períodos pendientes" valor={actual.periodos} detalle={`${actual.atrasados} libros atrasados`} />
              {datos.fechaMeta ? (
                <Dato
                  etiqueta="Meta"
                  valor={fmtFecha(datos.fechaMeta)}
                  cls={clsx("font-plex text-[18px]", diasMeta != null && diasMeta < 0 && "text-red-700")}
                  detalle={
                    diasMeta == null || diasMeta < 0
                      ? "Fecha meta vencida"
                      : `Faltan ${semanasMeta} semanas · hace falta ${Math.ceil(actual.periodos / Math.max(1, semanasMeta ?? 1))} por semana`
                  }
                />
              ) : (
                <div className="flex flex-col gap-1">
                  <span className={ETIQUETA}>Meta</span>
                  {datos.esAdmin ? (
                    <Link href="/libros/configuracion" className="text-[12.5px] font-semibold text-bordo hover:underline">
                      Definir fecha meta
                    </Link>
                  ) : (
                    <span className="text-[12.5px] text-ink-muted">Sin definir</span>
                  )}
                </div>
              )}
              <Dato etiqueta="Ritmo actual" valor={ritmoActual} detalle="períodos por semana desde la base" />
            </div>
          </Seccion>
          <Seccion
            titulo="Mantenimiento: envío anual"
            ayuda="Clientes con el último balance legalizado o finalizado: completo = todos los libros del envío anual copiados hasta ese cierre."
          >
            <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
              <Dato etiqueta="Envíos completos" valor={`${envios.completos} de ${envios.total}`} detalle={pct(envios.completos, envios.total)} />
              <Dato etiqueta="Pendientes" valor={envios.pendientes.length} detalle={`${envios.pendientes.filter((e) => e.legalizado).length} con el acta por hacer`} />
            </div>
          </Seccion>
        </div>

        {/* 2. Cuánto falta */}
        <Seccion titulo="Cuánto falta">
          <div className="flex flex-wrap gap-x-8 gap-y-3 pb-4 border-b border-line-row">
            <Dato etiqueta="Períodos pendientes" valor={actual.periodos} detalle={`en ${actual.atrasados} libros`} />
            <Dato etiqueta="Sin dato" valor={actual.sinDato} detalle="relevar, no copiar" />
            <Dato etiqueta="Sin libro" valor={actual.sinLibro} detalle="pedir presupuesto" />
            <Dato etiqueta="Al día" valor={`${actual.alDia} de ${actual.total}`} detalle={pct(actual.alDia, actual.total)} />
            {actual.sinCargar > 0 && <Dato etiqueta="Sin cargar en la ficha" valor={actual.sinCargar} />}
          </div>
          {datos.masAtrasados.length === 0 ? (
            <p className="pt-4 text-[12.5px] text-ink-subtle">No hay libros atrasados con último copiado cargado.</p>
          ) : (
            <table className="mt-3 w-full text-[13px]">
              <thead>
                <tr>
                  <th className={clsx(TH, "text-left px-0")}>Cliente</th>
                  <th className={clsx(TH, "text-left")}>Libro</th>
                  <th className={clsx(TH, "text-right px-0")}>Faltan</th>
                </tr>
              </thead>
              <tbody>
                {datos.masAtrasados.map((l) => (
                  <tr key={l.libroId} className="border-t border-line-row">
                    <td className="py-1.5 pr-3">
                      <Link href={`/libros/clientes/${l.clienteId}`} className="text-ink hover:text-bordo">
                        {l.clienteNombre}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5 text-ink-cell">{l.libroNombre}</td>
                    <td className={clsx(NUM, "py-1.5 whitespace-nowrap")}>{textoPeriodos(l.periodos, l.periodicidad)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Seccion>

        {/* 3. Cuánto se logró */}
        <Seccion titulo="Cuánto se logró" ayuda={`Línea base: el estado del sheet importado al ${fmtFecha(base.fecha)}.`}>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-x-8 gap-y-3">
                <Dato
                  etiqueta="Períodos pendientes"
                  valor={`${base.periodos} → ${actual.periodos}`}
                  detalle={reduccion > 0 ? `${reduccion} menos (${pct(reduccion, base.periodos)})` : "Sin cambios desde la base"}
                />
                <Dato
                  etiqueta="Libros al día"
                  valor={`${base.alDia} → ${actual.alDia}`}
                  detalle={actual.alDia > base.alDia ? `${actual.alDia - base.alDia} más` : undefined}
                />
              </div>
              <table className="w-full text-[13px]">
                <thead>
                  <tr>
                    <th className={clsx(TH, "text-left px-0")} />
                    <th className={clsx(TH, "text-right")}>7 días</th>
                    <th className={clsx(TH, "text-right")}>30 días</th>
                    <th className={clsx(TH, "text-right px-0")}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-line-row">
                    <td className="py-1.5 text-ink-cell">Libros puestos al día</td>
                    <td className={clsx(NUM, "px-3")}>{logrado.puestos.semana}</td>
                    <td className={clsx(NUM, "px-3")}>{logrado.puestos.mes}</td>
                    <td className={NUM}>{logrado.puestos.total}</td>
                  </tr>
                  <tr className="border-t border-line-row">
                    <td className="py-1.5 text-ink-cell">Envíos anuales copiados</td>
                    <td className={clsx(NUM, "px-3")}>{logrado.envios.semana}</td>
                    <td className={clsx(NUM, "px-3")}>{logrado.envios.mes}</td>
                    <td className={NUM}>{logrado.envios.total}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div>
              <p className={clsx(ETIQUETA, "mb-1")}>Períodos pendientes por semana</p>
              <Evolucion puntos={datos.evolucion} />
            </div>
          </div>
        </Seccion>

        <div className="grid gap-4 md:grid-cols-2">
          {/* 4. Por prioridad */}
          <Seccion titulo="Tareas abiertas por prioridad">
            <table className="w-full text-[13px]">
              <thead>
                <tr>
                  <th className={clsx(TH, "text-left px-0")}>Prioridad</th>
                  <th className={clsx(TH, "text-right")}>Abiertas</th>
                  <th className={clsx(TH, "text-right px-0")}>Antigüedad promedio</th>
                </tr>
              </thead>
              <tbody>
                {datos.prioridad.map((p) => (
                  <tr key={p.prioridad} className="border-t border-line-row">
                    <td className="py-2">
                      <span className={clsx(CHIP, PRIORIDAD_INFO[p.prioridad].cls)}>{PRIORIDAD_INFO[p.prioridad].label}</span>
                    </td>
                    <td className={clsx(NUM, "px-3")}>{p.abiertas}</td>
                    <td className={NUM}>{p.antiguedad == null ? "—" : `${p.antiguedad} días`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Seccion>

          {/* 6. Mandatos y balances */}
          <Seccion titulo="Mandatos y balances">
            <div className="flex flex-wrap gap-2 pb-3">
              <span className={clsx(CHIP, SEMAFORO.verdeClaro)}>{mandatos.vigentes} vigentes</span>
              <span className={clsx(CHIP, SEMAFORO.amarillo)}>{mandatos.porVencer.length} por vencer</span>
              <span className={clsx(CHIP, mandatos.vencidos.length ? SEMAFORO.rojo : SEMAFORO.sinDato)}>
                {mandatos.vencidos.length} vencidos
              </span>
              <Link href="/libros/clientes" className={clsx(CHIP, SEMAFORO.sinDato, "hover:text-ink")}>
                {mandatos.sinCargar.length} sin cargar
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className={clsx(ETIQUETA, "mb-1")}>Vencidos y por vencer</p>
                <ListaClientes
                  vacio="Ninguno."
                  filas={[...mandatos.vencidos, ...mandatos.porVencer].map((m) => ({
                    clienteId: m.clienteId,
                    nombre: m.nombre,
                    extra: (
                      <span className={clsx(NUM, "whitespace-nowrap", m.dias < 0 && "text-red-700")}>{fmtFecha(m.vence)}</span>
                    ),
                  }))}
                />
              </div>
              <div>
                <p className={clsx(ETIQUETA, "mb-1")}>Balance legalizado, acta pendiente</p>
                <ListaClientes
                  vacio="Ninguno."
                  filas={envios.pendientes
                    .filter((e) => e.legalizado)
                    .map((e) => ({
                      clienteId: e.clienteId,
                      nombre: e.nombre,
                      extra: <span className={clsx(NUM, "whitespace-nowrap")}>B{e.anio}</span>,
                    }))}
                />
              </div>
            </div>
          </Seccion>
        </div>

        {/* 5. Por responsable (solo admin) */}
        {datos.porResponsable && (
          <Seccion titulo="Avance por responsable" ayuda="Solo administradores. La parte de cada persona son los libros de los clientes que tiene asignados en Libros.">
            {datos.porResponsable.length === 0 ? (
              <p className="text-[12.5px] text-ink-subtle">Todavía no hay libros con atraso calculable.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr>
                      <th className={clsx(TH, "text-left px-0")}>Responsable</th>
                      <th className={clsx(TH, "text-right")}>Períodos (base → hoy)</th>
                      <th className={clsx(TH, "text-right")}>Avance</th>
                      <th className={clsx(TH, "text-right hidden sm:table-cell")}>Puestos al día</th>
                      <th className={clsx(TH, "text-right hidden md:table-cell")}>Al día</th>
                      <th className={clsx(TH, "text-right hidden md:table-cell px-0")}>Sin dato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.porResponsable.map((r) => {
                      const avance = r.periodosBase - r.periodosHoy;
                      return (
                        <tr key={r.id || "sin"} className="border-t border-line-row">
                          <td className="py-2 pr-3 text-ink">{r.nombre}</td>
                          <td className={clsx(NUM, "px-3 whitespace-nowrap")}>
                            {r.periodosBase} → {r.periodosHoy}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-20 h-1.5 rounded-full bg-paper-hover overflow-hidden hidden sm:block">
                                <div
                                  className="h-full rounded-full bg-bordo"
                                  style={{ width: r.periodosBase ? `${Math.max(0, Math.min(100, (avance / r.periodosBase) * 100))}%` : "0%" }}
                                />
                              </div>
                              <span className={NUM}>{r.periodosBase ? pct(Math.max(0, avance), r.periodosBase) : "—"}</span>
                            </div>
                          </td>
                          <td className={clsx(NUM, "px-3 hidden sm:table-cell")}>{r.puestosAlDia}</td>
                          <td className={clsx(NUM, "px-3 hidden md:table-cell")}>
                            {r.alDia}/{r.libros}
                          </td>
                          <td className={clsx(NUM, "hidden md:table-cell")}>{r.sinDato}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Seccion>
        )}

        {envios.pendientes.length > 0 && (
          <div className="flex justify-end">
            <Link href="/libros" className={BOTON_SECUNDARIO}>
              Ir a Seguimiento
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
