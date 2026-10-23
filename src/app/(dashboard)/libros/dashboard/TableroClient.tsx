"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import clsx from "clsx";
import { GripVertical, HelpCircle } from "lucide-react";
import { DEFINICION_PRIORIDAD, PRIORIDAD_INFO, diasHasta, fmtFecha, textoPeriodos } from "@/lib/libros";
import type { EnvioAnual, LibroAtraso } from "@/lib/librosTablero";
import type { PrioridadLibro } from "@/types";
import { guardarOrdenDashboard } from "../actions";
import { CHIP, ENCABEZADO, MONO, NUM, PAGINA, PANEL, PANEL_CABECERA, RAYA_MODULO, SEMAFORO, TH, TITULO } from "../ui";
import type { ObjetivoConAvance } from "@/lib/librosObjetivosMetricas";
import { ObjetivosDashboard } from "./Objetivos";
import { BackupButton } from "@/components/BackupButton";
import { DescargarExcelButton } from "@/components/DescargarExcelButton";

type MandatoFila = { clienteId: string; nombre: string; vence: string; dias: number };

export type FilaCategoria = { id: string; label: string; empresas: number; libros: number; de: number };

type FilaLogrado = {
  id: string;
  label: string;
  empresas: number;
  libros: number;
  delSheet: number;
  enBos: number;
  empresas30: number;
  libros30: number;
};

export type DatosTablero = {
  objetivos: ObjetivoConAvance[];
  hoy: string;
  fechaMeta: string | null;
  tablaSnapshots: boolean;
  esAdmin: boolean;
  ordenGuardado: string[];
  base: { fecha: string; libros: number; empresas: number; alDia: number };
  actual: {
    libros: number;
    empresas: number;
    alDia: number;
    total: number;
    empresasTotal: number;
    sinDatoLibros: number;
    sinDatoEmpresas: number;
    sinLibroLibros: number;
    sinLibroEmpresas: number;
  };
  pendienteLibro: FilaCategoria[];
  pendienteSocietario: FilaCategoria[];
  masAtrasados: LibroAtraso[];
  logrado: { porLibro: FilaLogrado[]; porSocietario: FilaLogrado[]; puestosAlDia: number; enviosCopiados: number };
  evolucion: { semana: string; fecha: string; libros: number; empresas: number }[];
  envios: { completos: number; total: number; pendientes: EnvioAnual[] };
  prioridad: { prioridad: PrioridadLibro; abiertas: number; antiguedad: number | null }[];
  mandatos: {
    vigentes: number;
    porVencer: MandatoFila[];
    vencidos: MandatoFila[];
    sinCargar: { clienteId: string; nombre: string }[];
    autoridades: { conAutoridades: number; total: number };
  };
  porResponsable:
    | {
        id: string;
        nombre: string;
        empresas: number;
        empresasBase: number;
        empresasHoy: number;
        librosBase: number;
        librosHoy: number;
        puestosAlDia: number;
      }[]
    | null;
};

const CIFRA = "font-archivo font-extrabold tracking-tight text-ink tabular-nums";
const ETIQUETA = "text-[10.5px] font-semibold text-ink-subtle uppercase tracking-[0.08em]";
const DETALLE = "mt-3 text-[12.5px] text-ink-muted [&>summary]:cursor-pointer [&>summary]:select-none [&>summary]:font-semibold";

function pct(parte: number, total: number): string {
  return total ? `${Math.round((parte / total) * 100)}%` : "—";
}

function Cifra({ valor, detalle, cls }: { valor: string | number; detalle?: React.ReactNode; cls?: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className={clsx(CIFRA, "text-[26px] leading-tight", cls)}>{valor}</span>
      {detalle && <span className="text-[12.5px] text-ink-muted">{detalle}</span>}
    </div>
  );
}

// Dos series (libros y empresas atrasados), misma escala de conteo: un solo eje,
// leyenda + etiqueta directa al final de cada línea, tooltip y tabla.
const SERIES = [
  { clave: "libros" as const, label: "Libros atrasados", color: "#7D1C2E", trazo: undefined },
  { clave: "empresas" as const, label: "Empresas atrasadas", color: "#605954", trazo: "5 4" },
];

function Evolucion({ puntos }: { puntos: DatosTablero["evolucion"] }) {
  const [activo, setActivo] = useState<number | null>(null);
  const W = 640;
  const H = 200;
  const M = { izq: 40, der: 40, arr: 16, aba: 28 };
  const max = Math.max(1, ...puntos.flatMap((p) => [p.libros, p.empresas]));
  const tope = Math.ceil(max / 10) * 10 || 10;
  const x = (i: number) => M.izq + (puntos.length === 1 ? 0 : (i * (W - M.izq - M.der)) / (puntos.length - 1));
  const y = (v: number) => M.arr + (1 - v / tope) * (H - M.arr - M.aba);
  const ultimo = puntos.length - 1;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-muted" aria-hidden="true">
        {SERIES.map((s) => (
          <span key={s.clave} className="inline-flex items-center gap-1.5">
            <svg width="18" height="8">
              <line x1="0" x2="18" y1="4" y2="4" stroke={s.color} strokeWidth={2} strokeDasharray={s.trazo} />
            </svg>
            {s.label}
          </span>
        ))}
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Evolución semanal de libros y empresas atrasados">
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={M.izq} x2={W - M.der} y1={y(tope * f)} y2={y(tope * f)} stroke="#EFEBE4" strokeWidth={1} />
              <text x={M.izq - 8} y={y(tope * f) + 4} textAnchor="end" fontSize={11} fill="#7C756E" className="font-plex">
                {Math.round(tope * f)}
              </text>
            </g>
          ))}
          {SERIES.map((s) => (
            <polyline
              key={s.clave}
              points={puntos.map((p, i) => `${x(i)},${y(p[s.clave])}`).join(" ")}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeDasharray={s.trazo}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {puntos.map((p, i) => (
            <g key={p.semana}>
              {SERIES.map((s) => (
                <circle
                  key={s.clave}
                  cx={x(i)}
                  cy={y(p[s.clave])}
                  r={activo === i ? 5 : 4}
                  fill={s.color}
                  stroke="#FCFBF9"
                  strokeWidth={2}
                />
              ))}
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
          {puntos.length > 0 &&
            SERIES.map((s) => (
              <text
                key={s.clave}
                x={x(ultimo) + 10}
                y={y(puntos[ultimo][s.clave]) + 4}
                fontSize={12}
                fontWeight={600}
                fill="#17141A"
                className="font-plex"
              >
                {puntos[ultimo][s.clave]}
              </text>
            ))}
        </svg>
        {activo != null && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg bg-ink px-2.5 py-1.5 text-[11.5px] text-white shadow"
            style={{ left: `${(x(activo) / W) * 100}%`, top: `${(y(Math.max(puntos[activo].libros, puntos[activo].empresas)) / H) * 100}%` }}
          >
            <p className={MONO}>{fmtFecha(puntos[activo].fecha)}</p>
            <p>
              <span className={MONO}>{puntos[activo].libros}</span> libros ·{" "}
              <span className={MONO}>{puntos[activo].empresas}</span> empresas atrasadas
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
              <th className={clsx(TH, "text-right")}>Libros</th>
              <th className={clsx(TH, "text-right")}>Empresas</th>
            </tr>
          </thead>
          <tbody>
            {puntos.map((p) => (
              <tr key={p.semana} className="border-t border-line-row">
                <td className={clsx(NUM, "text-left py-1")}>{fmtFecha(p.fecha)}</td>
                <td className={clsx(NUM, "px-3")}>{p.libros}</td>
                <td className={clsx(NUM, "px-3")}>{p.empresas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function TablaCategorias({ filas, columnas }: { filas: { label: string; valores: (string | number)[] }[]; columnas: string[] }) {
  return (
    <table className="w-full text-[12.5px]">
      <thead>
        <tr>
          <th className={clsx(TH, "text-left px-0")} />
          {columnas.map((c) => (
            <th key={c} className={clsx(TH, "text-right")}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => (
          <tr key={f.label} className="border-t border-line-row">
            <td className="py-1.5 text-ink-cell">{f.label}</td>
            {f.valores.map((v, i) => (
              <td key={i} className={clsx(NUM, "px-3")}>
                {v}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ListaClientes({ filas, vacio }: { filas: { clienteId: string; nombre: string; extra?: React.ReactNode }[]; vacio: string }) {
  if (filas.length === 0) return <p className="text-[12.5px] text-ink-subtle">{vacio}</p>;
  return (
    <ul className="divide-y divide-line-row">
      {filas.slice(0, 10).map((f) => (
        <li key={f.clienteId} className="flex items-baseline justify-between gap-3 py-1.5">
          <Link href={`/libros/clientes/${f.clienteId}`} className="text-[12.5px] text-ink hover:text-bordo truncate">
            {f.nombre}
          </Link>
          {f.extra}
        </li>
      ))}
      {filas.length > 10 && <li className="pt-1.5 text-[12px] text-ink-subtle">y {filas.length - 10} más</li>}
    </ul>
  );
}

type Tarjeta = { id: string; titulo: string; ayuda?: string; ancho?: boolean; contenido: React.ReactNode };

export function TableroClient({ datos }: { datos: DatosTablero }) {
  const { base, actual, logrado, envios, mandatos } = datos;
  const diasMeta = datos.fechaMeta ? diasHasta(datos.fechaMeta) : null;
  const semanasMeta = diasMeta != null && diasMeta > 0 ? Math.ceil(diasMeta / 7) : null;
  const semanasDesdeBase = Math.max(1, Math.round(-diasHasta(base.fecha) / 7));
  const ritmoActual = Math.round((logrado.puestosAlDia / semanasDesdeBase) * 10) / 10;
  const menosLibros = base.libros - actual.libros;
  const menosEmpresas = base.empresas - actual.empresas;

  const tarjetas: Tarjeta[] = [
    {
      id: "objetivo",
      titulo: "Puesta al día",
      ayuda: "Objetivo: atraso a 0 para la fecha meta. Atrasado = tiene último copiado y no llega a lo exigible hoy.",
      contenido: (
        <>
          <Cifra
            valor={actual.empresas}
            detalle={
              <>
                empresas con atraso · <span className={MONO}>{actual.libros}</span> libros
              </>
            }
          />
          <p className="mt-2 text-[12.5px] text-ink-muted">
            {datos.fechaMeta ? (
              diasMeta != null && diasMeta >= 0 ? (
                <>
                  Meta <span className={MONO}>{fmtFecha(datos.fechaMeta)}</span>: hacen falta{" "}
                  <span className={MONO}>{Math.ceil(actual.libros / Math.max(1, semanasMeta ?? 1))}</span> libros por semana (ritmo
                  actual <span className={MONO}>{ritmoActual}</span>).
                </>
              ) : (
                <span className="text-red-700">
                  La meta (<span className={MONO}>{fmtFecha(datos.fechaMeta)}</span>) ya venció.
                </span>
              )
            ) : datos.esAdmin ? (
              <Link href="/libros/configuracion" className="font-semibold text-bordo hover:underline">
                Definir fecha meta
              </Link>
            ) : (
              "Sin fecha meta."
            )}
          </p>
        </>
      ),
    },
    {
      id: "mantenimiento",
      titulo: "Mantenimiento",
      ayuda: "Clientes con el último balance legalizado o finalizado. Completo = todos los libros del envío anual copiados hasta ese cierre.",
      contenido: (
        <>
          <Cifra
            valor={`${envios.completos} de ${envios.total}`}
            detalle="clientes con el envío del último balance completo"
          />
          {envios.pendientes.length > 0 && (
            <details className={DETALLE}>
              <summary>Ver los {envios.pendientes.length} pendientes</summary>
              <div className="mt-2">
                <ListaClientes
                  vacio=""
                  filas={envios.pendientes.map((e) => ({
                    clienteId: e.clienteId,
                    nombre: e.nombre,
                    extra: (
                      <span className={clsx(NUM, "whitespace-nowrap")}>
                        B{e.anio} · faltan {e.faltan}
                      </span>
                    ),
                  }))}
                />
              </div>
            </details>
          )}
        </>
      ),
    },
    {
      id: "pendiente-libro",
      titulo: "Pendiente por tipo de libro",
      contenido: (
        <>
          <Cifra valor={actual.empresas} detalle="empresas con algún libro atrasado" />
          <div className="mt-3">
            <TablaCategorias
              columnas={["Empresas", "Libros"]}
              filas={datos.pendienteLibro.map((f) => ({ label: f.label, valores: [`${f.empresas} / ${f.de}`, f.libros] }))}
            />
          </div>
          {datos.masAtrasados.length > 0 && (
            <details className={DETALLE}>
              <summary>Ver los más atrasados</summary>
              <ul className="mt-2 divide-y divide-line-row">
                {datos.masAtrasados.slice(0, 12).map((l) => (
                  <li key={l.libroId} className="flex items-baseline justify-between gap-3 py-1.5">
                    <Link href={`/libros/clientes/${l.clienteId}`} className="text-ink hover:text-bordo truncate">
                      {l.clienteNombre} · {l.libroNombre}
                    </Link>
                    <span className={clsx(NUM, "whitespace-nowrap")}>{textoPeriodos(l.periodos, l.periodicidad)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      ),
    },
    {
      id: "pendiente-societario",
      titulo: "Pendiente por tipo societario",
      contenido: (
        <>
          <Cifra valor={`${actual.empresas} de ${actual.empresasTotal}`} detalle="empresas con atraso" />
          <div className="mt-3">
            <TablaCategorias
              columnas={["Empresas", "Libros"]}
              filas={datos.pendienteSocietario.map((f) => ({ label: f.label, valores: [`${f.empresas} / ${f.de}`, f.libros] }))}
            />
          </div>
        </>
      ),
    },
    {
      id: "sin-dato",
      titulo: "Sin dato y sin libro",
      ayuda: "Sin dato: no tiene último copiado cargado, hay que relevarlo. Sin libro: falta el libro, hay que pedir presupuesto.",
      contenido: (
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <Cifra
            valor={actual.sinDatoLibros}
            detalle={
              <>
                libros sin dato en <span className={MONO}>{actual.sinDatoEmpresas}</span> empresas
              </>
            }
          />
          <Cifra
            valor={actual.sinLibroLibros}
            detalle={
              <>
                sin libro en <span className={MONO}>{actual.sinLibroEmpresas}</span> empresas
              </>
            }
          />
        </div>
      ),
    },
    {
      id: "logrado",
      titulo: "Logrado",
      ayuda: `Copiados registrados: el historial importado del sheet más lo registrado en BOS. "Puestos al día" se compara con la línea base del ${fmtFecha(base.fecha)}.`,
      contenido: (
        <>
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <Cifra
              valor={logrado.puestosAlDia}
              detalle={<>libros puestos al día desde el {fmtFecha(base.fecha)}</>}
            />
            <Cifra valor={logrado.enviosCopiados} detalle="libros del envío anual copiados" />
          </div>
          <p className="mt-2 text-[12.5px] text-ink-muted">
            Atrasados: <span className={MONO}>{base.empresas}</span> → <span className={MONO}>{actual.empresas}</span> empresas
            {menosEmpresas > 0 && ` (${pct(menosEmpresas, base.empresas)} menos)`}, <span className={MONO}>{base.libros}</span> →{" "}
            <span className={MONO}>{actual.libros}</span> libros{menosLibros > 0 && ` (${pct(menosLibros, base.libros)} menos)`}.
          </p>
          <details className={DETALLE}>
            <summary>Ver por tipo de libro y societario</summary>
            <div className="mt-2 space-y-3">
              {[logrado.porLibro, logrado.porSocietario].map((filas, i) => (
                <TablaCategorias
                  key={i}
                  columnas={["Empresas", "Libros", "Últ. 30 días", "Sheet", "BOS"]}
                  filas={filas.map((f) => ({
                    label: f.label,
                    valores: [f.empresas, f.libros, `${f.empresas30} / ${f.libros30}`, f.delSheet, f.enBos],
                  }))}
                />
              ))}
              <p className="text-[11.5px] text-ink-subtle">
                &ldquo;Últ. 30 días&rdquo; = empresas / libros. &ldquo;Sheet&rdquo; y &ldquo;BOS&rdquo; = copiados registrados en cada uno.
              </p>
            </div>
          </details>
        </>
      ),
    },
    {
      id: "evolucion",
      titulo: "Evolución semanal",
      ancho: true,
      contenido: datos.tablaSnapshots || datos.evolucion.length > 1 ? (
        <Evolucion puntos={datos.evolucion} />
      ) : (
        <p className="text-[12.5px] text-ink-muted">
          La evolución se empieza a guardar cuando se corre <span className={MONO}>add_libros_etapa7.sql</span>.
        </p>
      ),
    },
    {
      id: "prioridad",
      titulo: "Tareas abiertas por prioridad",
      ayuda: Object.values(DEFINICION_PRIORIDAD).join(" "),
      contenido: (
        <>
          <Cifra valor={datos.prioridad.reduce((n, p) => n + p.abiertas, 0)} detalle="tareas abiertas" />
          <table className="mt-3 w-full text-[12.5px]">
            <tbody>
              {datos.prioridad.map((p) => (
                <tr key={p.prioridad} className="border-t border-line-row">
                  <td className="py-1.5">
                    <span className={clsx(CHIP, PRIORIDAD_INFO[p.prioridad].cls)} title={DEFINICION_PRIORIDAD[p.prioridad]}>
                      {PRIORIDAD_INFO[p.prioridad].label}
                    </span>
                  </td>
                  <td className={clsx(NUM, "px-3")}>{p.abiertas}</td>
                  <td className={NUM}>{p.antiguedad == null ? "—" : `${p.antiguedad} días`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ),
    },
    {
      id: "mandatos",
      titulo: "Mandatos y balances",
      contenido: (
        <>
          <Cifra
            valor={mandatos.vencidos.length}
            cls={mandatos.vencidos.length ? "text-red-700" : undefined}
            detalle={
              <>
                mandatos vencidos · <span className={MONO}>{mandatos.porVencer.length}</span> por vencer
              </>
            }
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <span className={clsx(CHIP, SEMAFORO.verdeClaro)}>{mandatos.vigentes} vigentes</span>
            <Link href="/libros/clientes" className={clsx(CHIP, SEMAFORO.sinDato, "hover:text-ink")}>
              {mandatos.sinCargar.length} sin cargar
            </Link>
            <span className={clsx(CHIP, SEMAFORO.verdeClaro)}>
              {envios.pendientes.filter((e) => e.legalizado).length} actas pendientes
            </span>
            <span className={clsx(CHIP, SEMAFORO.sinDato)}>
              {mandatos.autoridades.conAutoridades} / {mandatos.autoridades.total} con autoridades
            </span>
          </div>
          <details className={DETALLE}>
            <summary>Ver clientes</summary>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              <div>
                <p className={clsx(ETIQUETA, "mb-1")}>Vencidos y por vencer</p>
                <ListaClientes
                  vacio="Ninguno."
                  filas={[...mandatos.vencidos, ...mandatos.porVencer].map((m) => ({
                    clienteId: m.clienteId,
                    nombre: m.nombre,
                    extra: <span className={clsx(NUM, "whitespace-nowrap", m.dias < 0 && "text-red-700")}>{fmtFecha(m.vence)}</span>,
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
          </details>
        </>
      ),
    },
  ];

  if (datos.porResponsable) {
    tarjetas.push({
      id: "responsables",
      titulo: "Avance por responsable",
      ancho: true,
      ayuda: "Solo administradores. La parte de cada persona son los clientes que tiene asignados en Libros.",
      contenido:
        datos.porResponsable.length === 0 ? (
          <p className="text-[12.5px] text-ink-subtle">Todavía no hay libros con atraso calculable.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr>
                  <th className={clsx(TH, "text-left px-0")}>Responsable</th>
                  <th className={clsx(TH, "text-right")}>Empresas atrasadas</th>
                  <th className={clsx(TH, "text-right")}>Libros atrasados</th>
                  <th className={clsx(TH, "text-right hidden sm:table-cell")}>Puestos al día</th>
                  <th className={clsx(TH, "text-right hidden md:table-cell px-0")}>Empresas</th>
                </tr>
              </thead>
              <tbody>
                {datos.porResponsable.map((r) => (
                  <tr key={r.id || "sin"} className="border-t border-line-row">
                    <td className="py-2 pr-3 text-ink">{r.nombre}</td>
                    <td className={clsx(NUM, "px-3 whitespace-nowrap")}>
                      {r.empresasBase} → {r.empresasHoy}
                    </td>
                    <td className={clsx(NUM, "px-3 whitespace-nowrap")}>
                      {r.librosBase} → {r.librosHoy}
                      <span className="text-ink-subtle">
                        {" "}
                        ({r.librosBase ? pct(Math.max(0, r.librosBase - r.librosHoy), r.librosBase) : "—"})
                      </span>
                    </td>
                    <td className={clsx(NUM, "px-3 hidden sm:table-cell")}>{r.puestosAlDia}</td>
                    <td className={clsx(NUM, "hidden md:table-cell")}>{r.empresas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
    });
  }

  // Orden por usuario: lo guardado primero, las tarjetas nuevas al final.
  const ids = tarjetas.map((t) => t.id);
  const [orden, setOrden] = useState<string[]>(() => [
    ...datos.ordenGuardado.filter((id) => ids.includes(id)),
    ...ids.filter((id) => !datos.ordenGuardado.includes(id)),
  ]);
  const [agarrado, setAgarrado] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startGuardar] = useTransition();
  const ordenadas = orden.map((id) => tarjetas.find((t) => t.id === id)).filter((t): t is Tarjeta => !!t);

  function soltar(destino: string) {
    if (!arrastrando || arrastrando === destino) return;
    const nuevo = orden.filter((id) => id !== arrastrando);
    nuevo.splice(nuevo.indexOf(destino), 0, arrastrando);
    setOrden(nuevo);
    startGuardar(async () => {
      const res = await guardarOrdenDashboard(nuevo);
      if (res.error) setError(res.error);
    });
  }

  return (
    <div className={PAGINA}>
      <div className={ENCABEZADO}>
        <span className={RAYA_MODULO} />
        <h1 className={TITULO}>Dashboard</h1>
        <span className={clsx(MONO, "text-[12px] text-ink-subtle")}>al {fmtFecha(datos.hoy)}</span>
        {datos.esAdmin && (
          <div className="ml-auto flex items-center gap-2">
            <DescargarExcelButton
              href="/api/exportar/libros/dashboard"
              title="Descargar este tablero (atrasados, mandatos, envíos) a Excel"
            />
            <BackupButton modulo="libros" />
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 pb-8">
        {error && <p className="mb-3 text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <ObjetivosDashboard objetivos={datos.objetivos} />
        <div className="grid gap-4 md:grid-cols-2">
          {ordenadas.map((t) => (
            <section
              key={t.id}
              draggable={agarrado === t.id}
              onDragStart={() => setArrastrando(t.id)}
              onDragOver={(e) => {
                if (!arrastrando) return;
                e.preventDefault();
                setSobre(t.id);
              }}
              onDragLeave={() => setSobre((s) => (s === t.id ? null : s))}
              onDrop={() => soltar(t.id)}
              onDragEnd={() => {
                setArrastrando(null);
                setSobre(null);
                setAgarrado(null);
              }}
              className={clsx(
                PANEL,
                "overflow-hidden",
                t.ancho && "md:col-span-2",
                arrastrando === t.id && "opacity-40",
                sobre === t.id && arrastrando && arrastrando !== t.id && "ring-2 ring-bordo"
              )}
            >
              <div className={clsx(PANEL_CABECERA, "px-3 py-2.5 flex items-center gap-2")}>
                <span
                  onMouseDown={() => setAgarrado(t.id)}
                  onMouseUp={() => setAgarrado(null)}
                  title="Arrastrá para cambiar el orden"
                  aria-hidden="true"
                  className="text-ink-subtle hover:text-ink cursor-grab active:cursor-grabbing"
                >
                  <GripVertical size={15} />
                </span>
                <h2 className="font-archivo text-[14px] font-bold text-ink">{t.titulo}</h2>
                {t.ayuda && (
                  <span title={t.ayuda} aria-label={t.ayuda} className="text-ink-subtle">
                    <HelpCircle size={13} />
                  </span>
                )}
              </div>
              <div className="p-4">{t.contenido}</div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
