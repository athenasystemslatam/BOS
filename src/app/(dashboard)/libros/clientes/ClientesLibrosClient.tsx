"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Search } from "lucide-react";
import { TIPOS_SOCIETARIOS, TIPO_SOCIETARIO_LABEL, diasHasta, fmtFecha } from "@/lib/libros";
import type { OrganismoSocietario, TipoSocietario } from "@/types";
import { ESTADO_BALANCE } from "../../contable/semaforo";
import { MandatoModal } from "../MandatoCampos";
import {
  BOTON_PRIMARIO,
  BOTON_SECUNDARIO,
  CHIP,
  CONTROL,
  ENCABEZADO,
  MONO,
  NUM,
  PAGINA,
  PANEL,
  RAYA_MODULO,
  SEMAFORO,
  TH,
  TITULO,
  VACIO,
  VACIO_TEXTO,
} from "../ui";

export type FilaClienteLibros = {
  id: string;
  nombre: string;
  cuit: string;
  /** Cliente activo en BOS. Los inactivos conservan su historial pero no estorban la vista. */
  activo: boolean;
  responsable: string | null;
  tipo: TipoSocietario | null;
  organismo: OrganismoSocietario | null;
  librosCorresponden: number;
  librosCargados: number;
  sinLibro: number;
  pocosFolios: number;
  mandatoVence: string | null;
  mandatoSinCargar: boolean;
  mandato: { mandato_designacion: string | null; mandato_anios: number | null; mandato_vence_preciso?: string | null } | null;
  balanceEstado: string | null;
  balanceAnio: number | null;
};

export function ClientesLibrosClient({ filas, puedeEditar }: { filas: FilaClienteLibros[]; puedeEditar: boolean }) {
  const [mandatoDe, setMandatoDe] = useState<FilaClienteLibros | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtroResp, setFiltroResp] = useState("");
  const [soloSinMandato, setSoloSinMandato] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState("");
  const [vista, setVista] = useState<"activos" | "inactivos" | "todos">("activos");

  const responsables = useMemo(
    () => Array.from(new Set(filas.map((f) => f.responsable).filter(Boolean) as string[])).sort(),
    [filas]
  );

  const visibles = filas.filter((f) => {
    if (vista === "activos" ? !f.activo : vista === "inactivos" ? f.activo : false) return false;
    const q = busqueda.trim().toLowerCase();
    if (q && !f.nombre.toLowerCase().includes(q) && !f.cuit.includes(q)) return false;
    if (filtroResp && f.responsable !== filtroResp) return false;
    if (filtroTipo && (filtroTipo === "sin_tipo" ? f.tipo : f.tipo !== filtroTipo)) return false;
    if (soloSinMandato && !f.mandatoSinCargar) return false;
    return true;
  });

  const sinTipo = filas.filter((f) => !f.tipo).length;
  const sinMandato = filas.filter((f) => f.mandatoSinCargar).length;
  const hayFiltros = !!busqueda.trim() || !!filtroResp || !!filtroTipo || soloSinMandato;
  const cuentaTipo = (t: string) => filas.filter((f) => f.tipo === t).length;

  function limpiar() {
    setBusqueda("");
    setFiltroResp("");
    setFiltroTipo("");
    setSoloSinMandato(false);
  }

  return (
    <div className={PAGINA}>
      <div className={ENCABEZADO}>
        <span className={RAYA_MODULO} />
        <h1 className={TITULO}>Clientes</h1>
        <p className="text-[12.5px] text-ink-muted">
          <span className={MONO}>{filas.filter((f) => f.activo).length}</span> clientes activos
          {sinTipo > 0 && (
            <>
              {" · "}
              <span className="font-semibold text-alerta-fg">{sinTipo}</span> sin tipo societario
            </>
          )}
        </p>
      </div>

      <div className="shrink-0 px-4 sm:px-6 pb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar cliente o CUIT…"
            aria-label="Buscar cliente o CUIT"
            className={clsx(CONTROL, "pl-8 w-60")}
          />
        </div>
        <select
          value={filtroResp}
          onChange={(e) => setFiltroResp(e.target.value)}
          aria-label="Responsable"
          className={clsx(CONTROL, "cursor-pointer")}
        >
          <option value="">Todos los responsables</option>
          {responsables.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <div className="inline-flex rounded-full border border-line-input bg-paper p-0.5" role="tablist" aria-label="Estado del cliente">
          {(
            [
              ["activos", "Activos", filas.filter((f) => f.activo).length],
              ["inactivos", "Inactivos", filas.filter((f) => !f.activo).length],
              ["todos", "Todos", filas.length],
            ] as const
          ).map(([v, label, n]) => (
            <button
              key={v}
              role="tab"
              aria-selected={vista === v}
              onClick={() => setVista(v)}
              className={clsx(
                "px-3 py-1 text-[12.5px] font-semibold rounded-full",
                vista === v ? "bg-ink text-white" : "text-ink-muted hover:text-ink"
              )}
            >
              {label} <span className="font-plex tabular-nums">{n}</span>
            </button>
          ))}
        </div>
        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
          aria-label="Tipo societario"
          className={clsx(CONTROL, "cursor-pointer")}
        >
          <option value="">Todos los tipos</option>
          {TIPOS_SOCIETARIOS.filter((t) => cuentaTipo(t.value) > 0).map((t) => (
            <option key={t.value} value={t.value}>
              {t.label} ({cuentaTipo(t.value)})
            </option>
          ))}
          {sinTipo > 0 && <option value="sin_tipo">Sin tipo cargado ({sinTipo})</option>}
        </select>
        <label className="flex items-center gap-1.5 text-[12.5px] text-ink-muted cursor-pointer min-h-[36px] px-1">
          <input
            type="checkbox"
            checked={soloSinMandato}
            onChange={(e) => setSoloSinMandato(e.target.checked)}
            className="accent-[#7D1C2E]"
          />
          Mandato sin cargar (<span className={MONO}>{sinMandato}</span>)
        </label>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 pb-6">
        {visibles.length === 0 ? (
          <div className={clsx(PANEL, VACIO)}>
            {filas.length === 0 ? (
              <>
                <p className={VACIO_TEXTO}>
                  Ningún cliente tiene el servicio Libros activo. Se activa desde Panel General → Editar cliente.
                </p>
                <Link href="/panel-general" className={BOTON_PRIMARIO}>
                  Ir a Panel General
                </Link>
              </>
            ) : (
              <>
                <p className={VACIO_TEXTO}>Ningún cliente coincide con los filtros.</p>
                {hayFiltros && (
                  <button onClick={limpiar} className={BOTON_SECUNDARIO}>
                    Limpiar filtros
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          <div className={clsx(PANEL, "overflow-x-auto")}>
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="sticky top-0 z-10 bg-paper">
                <tr>
                  <th className={clsx(TH, "text-left px-4")}>Cliente</th>
                  <th className={clsx(TH, "text-left")}>Tipo</th>
                  <th className={clsx(TH, "text-right")}>Libros</th>
                  <th className={clsx(TH, "text-left")}>Alertas</th>
                  <th className={clsx(TH, "text-right")}>Mandato vence</th>
                  <th className={clsx(TH, "text-left hidden lg:table-cell")}>Balance (Contable)</th>
                  <th className={clsx(TH, "text-left hidden md:table-cell")}>Responsable</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((f) => {
                  const dias = f.mandatoVence ? diasHasta(f.mandatoVence) : null;
                  const bal = f.balanceEstado ? ESTADO_BALANCE[f.balanceEstado] : undefined;
                  return (
                    <tr key={f.id} className="border-t border-line-row hover:bg-paper-hover">
                      <td className="px-4 py-2.5 whitespace-normal">
                        <Link href={`/libros/clientes/${f.id}`} className="block">
                          <p className="font-archivo text-[13.5px] font-bold text-ink hover:text-bordo">
                            {f.nombre}
                            {!f.activo && <span className={clsx(CHIP, SEMAFORO.sinDato, "ml-2 align-middle font-sans")}>Inactivo</span>}
                          </p>
                          <p className={clsx(MONO, "text-[11.5px] text-ink-subtle")}>{f.cuit}</p>
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-[12px]">
                        {f.tipo ? (
                          <span className="text-ink-cell">
                            {TIPO_SOCIETARIO_LABEL[f.tipo]}
                            {f.organismo && <span className="text-ink-subtle"> · {f.organismo}</span>}
                          </span>
                        ) : (
                          <span className={clsx(CHIP, SEMAFORO.sinDato)}>Sin cargar</span>
                        )}
                      </td>
                      <td className={clsx(NUM, "px-3 py-2.5")}>
                        {f.tipo ? `${f.librosCargados} / ${f.librosCorresponden}` : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {f.sinLibro > 0 && <span className={clsx(CHIP, SEMAFORO.rojo)}>{f.sinLibro} sin libro</span>}
                          {f.pocosFolios > 0 && (
                            <span className={clsx(CHIP, SEMAFORO.naranja)}>{f.pocosFolios} con pocos folios</span>
                          )}
                          {f.sinLibro === 0 && f.pocosFolios === 0 && <span className="text-ink-ghost">—</span>}
                        </div>
                      </td>
                      <td
                        className={clsx(
                          NUM,
                          "px-3 py-2.5",
                          dias != null && dias < 0 && "!text-red-700 font-semibold",
                          dias != null && dias >= 0 && dias <= 90 && "!text-orange-700 font-semibold"
                        )}
                      >
                        <button
                          type="button"
                          disabled={!puedeEditar || !f.tipo}
                          onClick={() => setMandatoDe(f)}
                          title={puedeEditar && f.tipo ? "Editar mandato" : undefined}
                          className="rounded-md px-1 -mx-1 hover:bg-paper-hover disabled:hover:bg-transparent disabled:cursor-default"
                        >
                          {f.mandatoVence ? (
                            fmtFecha(f.mandatoVence)
                          ) : f.mandatoSinCargar ? (
                            <span className={clsx(CHIP, SEMAFORO.sinDato, "font-sans")}>
                              {puedeEditar ? "Cargar" : "Sin cargar"}
                            </span>
                          ) : (
                            <span className="text-ink-ghost">—</span>
                          )}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 hidden lg:table-cell">
                        {bal ? (
                          <span className={clsx(CHIP, bal.cls)}>
                            {f.balanceAnio} · {bal.label}
                            {f.balanceEstado === "legalizado" && " · acta pendiente"}
                          </span>
                        ) : (
                          <span className="text-ink-ghost">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-ink-muted hidden md:table-cell">
                        {f.responsable ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {mandatoDe && (
        <MandatoModal
          cliente={{ id: mandatoDe.id, nombre: mandatoDe.nombre, tipo: mandatoDe.tipo, mandato: mandatoDe.mandato }}
          onClose={() => setMandatoDe(null)}
        />
      )}
    </div>
  );
}
