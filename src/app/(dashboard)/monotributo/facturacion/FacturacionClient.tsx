"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import { ChevronDown, FileDown, Search, X } from "lucide-react";
import { MESES_NOMBRES } from "@/lib/vencimientos";
import { useDeshacer } from "@/components/DeshacerAviso";
import { useFiltroGuardado } from "@/components/useFiltroGuardado";
import { FichaClienteBoton } from "@/components/FichaClienteBoton";
import { getFichaCliente } from "@/app/(dashboard)/panel-general/actions";
import {
  categoriaCorrespondiente,
  fmtFecha,
  fmtPesos,
  leerImporte,
  semaforo,
  ventana12,
  type Control,
  type FilaCategoria,
} from "@/lib/monotributoFacturacion";
import type { FilaFacturacion } from "@/lib/monotributoFacturacionServer";
import { guardarCarga, type CambiosCarga } from "./facturacionActions";

type Estado = "" | "sin_cargar" | "cargado" | "ficha_enviada" | "cerca" | "sobre";

const COLOR_SEMAFORO = {
  verde: "bg-emerald-50 text-emerald-700",
  amarillo: "bg-amber-50 text-amber-800",
  rojo: "bg-red-50 text-red-700",
  sin_dato: "bg-gray-100 text-gray-400",
} as const;

/** Facturación de los últimos 12 meses por control: carga manual, % del tope y ficha para el cliente. */
export function FacturacionClient({
  controles,
  control,
  enCursoId,
  filas: iniciales,
  errorFilas,
  disponible,
  topes,
  vigenteDesde,
  umbral,
  nombres,
  yoId,
  puedeEditar,
  hoy,
}: {
  controles: Control[];
  control: Control | null;
  enCursoId: string | null;
  filas: FilaFacturacion[];
  errorFilas: string | null;
  disponible: boolean;
  topes: FilaCategoria[];
  vigenteDesde: string | null;
  umbral: number;
  nombres: Record<string, string>;
  yoId: string;
  puedeEditar: boolean;
  hoy: string;
}) {
  const router = useRouter();
  const { ofrecer, aviso } = useDeshacer();
  const [filas, setFilas] = useState(iniciales);
  const [estado, setEstado] = useState<Estado>("");
  const [busqueda, setBusqueda] = useState("");
  const [filtroResp, setFiltroResp] = useFiltroGuardado("monotributo.facturacion.responsable", (v) =>
    v === "__mios__" || v === "__sin__" || iniciales.some((f) => f.responsable_id === v)
  );
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const topePor = useMemo(() => new Map(topes.map((t) => [t.categoria as string, t.tope_anual])), [topes]);

  /** Recalcula una fila al instante (mismo cálculo que la base) para no esperar la recarga. */
  function recalcular(f: FilaFacturacion, cambios: CambiosCarga): FilaFacturacion {
    const n = { ...f, ...cambios } as FilaFacturacion;
    const tope = f.categoria ? (topePor.get(f.categoria) ?? null) : null;
    const total = n.total_facturado;
    return {
      ...n,
      cargado: total !== null && total !== undefined,
      tope,
      pct: tope && total !== null ? Math.round((total * 1000) / tope) / 10 : null,
      margen: tope && total !== null ? tope - total : null,
      categoria_correspondiente: total !== null ? categoriaCorrespondiente(total, topes) : null,
    };
  }

  function guardar(f: FilaFacturacion, cambios: CambiosCarga, texto: string) {
    if (!control) return;
    const antes = filas;
    setFilas((fs) => fs.map((x) => (x.cliente_id === f.cliente_id ? recalcular(x, cambios) : x)));
    setError(null);
    start(async () => {
      const r = await guardarCarga(f.cliente_id, control.id, cambios).catch(() => ({ error: "No hay conexión con el servidor." }));
      if ("error" in r) {
        setFilas(antes);
        setError(`${f.nombre}: ${r.error}`);
        return;
      }
      ofrecer(r.historialIds, `${f.nombre}: ${texto}`, () => router.refresh());
    });
  }

  const responsables = useMemo(() => {
    const ids = Array.from(new Set(iniciales.map((f) => f.responsable_id).filter((x): x is string => !!x)));
    return ids.map((id) => ({ id, nombre: nombres[id] ?? "—" })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [iniciales, nombres]);

  const conteo = useMemo(() => {
    const c = { total: filas.length, cargados: 0, fichas: 0, cerca: 0, sobre: 0, sinCategoria: 0 };
    for (const f of filas) {
      if (f.cargado) c.cargados++;
      if (f.ficha_enviada) c.fichas++;
      const s = semaforo(f.pct, umbral);
      if (s === "amarillo") c.cerca++;
      if (s === "rojo") c.sobre++;
      if (!f.categoria) c.sinCategoria++;
    }
    return c;
  }, [filas, umbral]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const qDig = q.replace(/\D/g, "");
    return filas
      .filter((f) => {
        if (filtroResp === "__mios__" && f.responsable_id !== yoId) return false;
        if (filtroResp === "__sin__" && f.responsable_id) return false;
        if (filtroResp && !filtroResp.startsWith("__") && f.responsable_id !== filtroResp) return false;
        if (q && !f.nombre.toLowerCase().includes(q) && !(qDig.length >= 3 && (f.cuit ?? "").replace(/\D/g, "").includes(qDig))) return false;
        const s = semaforo(f.pct, umbral);
        if (estado === "sin_cargar") return !f.cargado;
        if (estado === "cargado") return f.cargado;
        if (estado === "ficha_enviada") return f.ficha_enviada;
        if (estado === "cerca") return s === "amarillo";
        if (estado === "sobre") return s === "rojo";
        return true;
      })
      // Orden por % del tope (lo más cerca o pasado arriba); lo sin cargar al final.
      .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || a.nombre.localeCompare(b.nombre));
  }, [filas, filtroResp, busqueda, estado, umbral, yoId]);

  const ventana = control ? ventana12(control.fecha_corte) : null;
  const sinCargar = conteo.total - conteo.cargados;
  const chip = (activo: boolean) =>
    clsx("px-3 py-1 rounded-full text-[12px] font-medium border transition-all", activo ? "bg-bordo text-white border-bordo" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700");

  return (
    <div className="flex flex-col h-full p-4 md:p-8 bg-gray-50">
      <div className="shrink-0 flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-5">
        <div>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mb-1">Monotributo · Facturación</p>
          <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">Facturación</h1>
          <p className="text-sm text-gray-400 mt-1">
            {control && ventana ? (
              <>Control de {MESES_NOMBRES[control.mes]} {control.anio}{control.es_cierre_semestre ? " (cierre de semestre)" : ""} · últimos 12 meses, del {fmtFecha(ventana.desde)} al {fmtFecha(ventana.hasta)}</>
            ) : "Sin controles cargados"}
            {vigenteDesde ? ` · topes vigentes desde el ${fmtFecha(vigenteDesde)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/monotributo/controles" className="px-3 py-2 rounded-lg border border-gray-200 text-[12px] font-medium text-gray-600 hover:bg-gray-50">Controles</Link>
          <Link href="/monotributo/categorias" className="px-3 py-2 rounded-lg border border-gray-200 text-[12px] font-medium text-gray-600 hover:bg-gray-50">Categorías</Link>
          <select
            value={control?.id ?? ""}
            onChange={(e) => router.push(`/monotributo/facturacion?control=${e.target.value}`)}
            className="py-2 px-4 rounded-lg border border-gray-200 bg-white text-[13px] font-medium text-gray-700 min-w-[190px]"
          >
            {controles.map((c) => (
              <option key={c.id} value={c.id}>
                Control {MESES_NOMBRES[c.mes]} {c.anio}{c.id === enCursoId ? " · en curso" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!disponible && (
        <p className="shrink-0 mb-4 text-[12.5px] bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-2.5">
          Falta correr el SQL de Facturación (add_monotributo_facturacion.sql).
        </p>
      )}
      {errorFilas && <p className="shrink-0 mb-4 text-[12.5px] bg-red-50 text-red-700 rounded-lg px-4 py-2.5">{errorFilas}</p>}
      {disponible && !vigenteDesde && (
        <Link href="/monotributo/categorias" className="shrink-0 block mb-4 text-[12.5px] bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-2.5 hover:bg-amber-100">
          Falta cargar la tabla de categorías de ARCA: sin ella no se calcula el % del tope. Cargarla →
        </Link>
      )}
      {control && control.id === enCursoId && sinCargar > 0 && (
        <p className="shrink-0 mb-4 text-[12.5px] bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-2.5">
          Control de {MESES_NOMBRES[control.mes].toLowerCase()}: {sinCargar} {sinCargar === 1 ? "cliente sin cargar" : "clientes sin cargar"}.
        </p>
      )}
      {conteo.sinCategoria > 0 && (
        <p className="shrink-0 mb-4 text-[12px] text-gray-500">
          {conteo.sinCategoria} cliente(s) sin categoría cargada: se puede anotar lo facturado, pero el % del tope y la ficha necesitan la categoría (se carga en la ficha del cliente).
        </p>
      )}
      {error && <p className="shrink-0 mb-3 text-[12.5px] bg-red-50 text-red-700 rounded-lg px-4 py-2">{error}</p>}

      <div className="shrink-0 grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Tarjeta label="Cargados" valor={`${conteo.cargados} de ${conteo.total}`} />
        <Tarjeta label="Fichas enviadas" valor={`${conteo.fichas}`} />
        <Tarjeta label={`Cerca del tope (desde ${umbral}%)`} valor={`${conteo.cerca}`} color={conteo.cerca ? "text-amber-700" : undefined} />
        <Tarjeta label="Sobre el tope" valor={`${conteo.sobre}`} color={conteo.sobre ? "text-red-600" : undefined} />
      </div>

      <div className="shrink-0 flex flex-wrap items-center gap-1.5 mb-3">
        <button className={chip(estado === "")} onClick={() => setEstado("")}>Todos ({conteo.total})</button>
        <button className={chip(estado === "sin_cargar")} onClick={() => setEstado("sin_cargar")}>Sin cargar ({sinCargar})</button>
        <button className={chip(estado === "cargado")} onClick={() => setEstado("cargado")}>Cargados ({conteo.cargados})</button>
        <button className={chip(estado === "ficha_enviada")} onClick={() => setEstado("ficha_enviada")}>Ficha enviada ({conteo.fichas})</button>
        <button className={chip(estado === "cerca")} onClick={() => setEstado("cerca")}>Cerca del tope ({conteo.cerca})</button>
        <button className={chip(estado === "sobre")} onClick={() => setEstado("sobre")}>Sobre el tope ({conteo.sobre})</button>
      </div>

      <div className="shrink-0 flex flex-wrap items-center gap-2 mb-4">
        <div className="relative max-w-xs w-full sm:w-56">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar cliente o CUIT..."
            className="w-full pl-8 pr-7 py-1.5 text-[12px] border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-bordo focus:border-bordo placeholder:text-gray-300 bg-white"
          />
          {busqueda && (
            <button onClick={() => setBusqueda("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"><X size={12} /></button>
          )}
        </div>
        <div className="relative">
          <select
            value={filtroResp}
            onChange={(e) => setFiltroResp(e.target.value)}
            className="appearance-none text-[12px] text-gray-600 bg-white border border-gray-200 rounded-lg pl-2.5 pr-7 py-1.5 cursor-pointer"
          >
            <option value="">Todos los responsables</option>
            <option value="__mios__">Mis clientes</option>
            {responsables.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            <option value="__sin__">Sin responsable</option>
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
        <span className="text-[11px] text-gray-400 ml-auto">{visibles.length} de {conteo.total} visibles · ordenado por % del tope</span>
      </div>

      <div className="flex-1 min-h-0 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="sticky top-0 bg-white z-20">
              <tr className="text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="px-6 py-3 sticky left-0 bg-white">Cliente</th>
                <th className="px-3 py-3">Responsable</th>
                <th className="px-3 py-3">Categ.</th>
                <th className="px-3 py-3">Facturado 12 meses</th>
                <th className="px-3 py-3">% del tope</th>
                <th className="px-3 py-3">Disponible</th>
                <th className="px-3 py-3">Correspondería</th>
                <th className="px-3 py-3">Ficha</th>
                <th className="px-3 py-3">Enviada al cliente</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visibles.map((f) => (
                <FilaCliente
                  key={f.cliente_id}
                  f={f}
                  controlId={control?.id ?? null}
                  responsable={f.responsable_id ? (nombres[f.responsable_id] ?? "—") : null}
                  umbral={umbral}
                  puedeEditar={puedeEditar && !!control}
                  hoy={hoy}
                  onGuardar={(c, t) => guardar(f, c, t)}
                />
              ))}
              {visibles.length === 0 && (
                <tr><td colSpan={9} className="px-6 py-10 text-center text-[13px] text-gray-400">No hay clientes con estos filtros.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {aviso}
    </div>
  );
}

function Tarjeta({ label, valor, color }: { label: string; valor: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
      <p className="text-[10.5px] font-semibold tracking-[.08em] uppercase text-gray-400">{label}</p>
      <p className={clsx("text-[20px] font-semibold mt-0.5", color ?? "text-gray-900")}>{valor}</p>
    </div>
  );
}

function FilaCliente({
  f,
  controlId,
  responsable,
  umbral,
  puedeEditar,
  hoy,
  onGuardar,
}: {
  f: FilaFacturacion;
  controlId: string | null;
  responsable: string | null;
  umbral: number;
  puedeEditar: boolean;
  hoy: string;
  onGuardar: (cambios: CambiosCarga, texto: string) => void;
}) {
  const [texto, setTexto] = useState(f.total_facturado === null ? "" : f.total_facturado.toLocaleString("es-AR", { minimumFractionDigits: 2 }));
  const [err, setErr] = useState(false);
  const s = semaforo(f.pct, umbral);

  function confirmarTotal() {
    const limpio = texto.trim();
    const nuevo = limpio === "" ? null : leerImporte(limpio);
    if (limpio !== "" && nuevo === null) return setErr(true);
    setErr(false);
    if (nuevo === f.total_facturado) return;
    if (nuevo !== null) setTexto(nuevo.toLocaleString("es-AR", { minimumFractionDigits: 2 }));
    onGuardar({ total_facturado: nuevo }, nuevo === null ? "carga borrada" : `facturado ${fmtPesos(nuevo)}`);
  }

  const motivoSinFicha = !f.categoria ? "Cargá la categoría primero" : !f.cargado ? "Cargá lo facturado primero" : null;

  return (
    <tr className="group hover:bg-amber-50/50 text-center">
      <td className="sticky left-0 z-10 bg-white group-hover:bg-amber-50 px-6 py-1.5 text-left">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-medium text-gray-800">{f.nombre}</span>
          <FichaClienteBoton clienteId={f.cliente_id} nombre={f.nombre} fetchAction={getFichaCliente} />
        </div>
      </td>
      <td className={clsx("px-3 py-1.5 text-[12px]", responsable ? "text-gray-600" : "text-red-600")}>{responsable ?? "Sin responsable"}</td>
      <td className="px-3 py-1.5 text-[12.5px] font-semibold text-gray-700">{f.categoria ?? <span className="text-gray-300 font-normal">—</span>}</td>
      <td className="px-3 py-1.5">
        {puedeEditar ? (
          <input
            value={texto}
            onChange={(e) => { setTexto(e.target.value); setErr(false); }}
            onBlur={confirmarTotal}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            placeholder="sin cargar"
            className={clsx(
              "w-36 text-[12.5px] text-right tabular-nums border rounded-md px-2 py-0.5 focus:outline-none focus:border-amber-400",
              err ? "border-red-400 bg-red-50" : "border-gray-200"
            )}
            title="Total facturado en la ventana de 12 meses (ej. 12.480.000,00)"
          />
        ) : (
          <span className="text-[12.5px] tabular-nums">{f.cargado ? fmtPesos(f.total_facturado) : "sin cargar"}</span>
        )}
      </td>
      <td className="px-3 py-1.5">
        <span className={clsx("text-[12px] font-semibold rounded-full px-2.5 py-0.5 tabular-nums", COLOR_SEMAFORO[s])}>
          {f.pct === null ? "—" : `${f.pct.toLocaleString("es-AR")}%`}
        </span>
      </td>
      <td className={clsx("px-3 py-1.5 text-[12.5px] tabular-nums", f.margen !== null && f.margen < 0 ? "text-red-600" : "text-gray-600")}>
        {f.margen === null ? "—" : fmtPesos(f.margen)}
      </td>
      <td className="px-3 py-1.5 text-[12.5px]">
        {f.categoria_correspondiente ? (
          <span className={clsx(f.categoria && f.categoria_correspondiente !== f.categoria ? "font-semibold text-amber-700" : "text-gray-600")}>
            {f.categoria_correspondiente}
          </span>
        ) : f.cargado && f.tope !== null ? <span className="text-red-600 font-medium">Supera K</span> : "—"}
      </td>
      <td className="px-3 py-1.5">
        {motivoSinFicha || !controlId ? (
          <span className="text-[11px] text-gray-300" title={motivoSinFicha ?? undefined}>{motivoSinFicha ?? "—"}</span>
        ) : (
          <a
            href={`/api/monotributo/ficha?cliente=${f.cliente_id}&control=${controlId}`}
            className="inline-flex items-center gap-1 text-[12px] text-bordo hover:underline"
            title="Descargar la ficha en PDF (BOS no la envía: la mandás vos)"
          >
            <FileDown size={13} /> PDF
          </a>
        )}
      </td>
      <td className="px-3 py-1.5">
        <div className="flex items-center justify-center gap-1.5">
          <input
            type="checkbox"
            className="accent-bordo"
            checked={f.ficha_enviada}
            disabled={!puedeEditar}
            onChange={(e) => onGuardar(
              { ficha_enviada: e.target.checked, ficha_enviada_fecha: e.target.checked ? (f.ficha_enviada_fecha ?? hoy) : null },
              e.target.checked ? "ficha marcada enviada" : "ficha desmarcada"
            )}
          />
          {f.ficha_enviada && (
            puedeEditar ? (
              <input
                type="date"
                value={f.ficha_enviada_fecha ?? ""}
                onChange={(e) => e.target.value && onGuardar({ ficha_enviada_fecha: e.target.value }, "fecha de envío")}
                className="text-[11.5px] border border-gray-200 rounded px-1 py-0.5"
              />
            ) : <span className="text-[11.5px] text-gray-500">{fmtFecha(f.ficha_enviada_fecha)}</span>
          )}
        </div>
      </td>
    </tr>
  );
}
