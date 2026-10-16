"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ArrowLeft, History, Pencil, Plus } from "lucide-react";
import {
  ESTADO_LIBRO,
  ORGANISMOS,
  PERIODICIDAD_LABEL,
  SOPORTE_LABEL,
  TIPOS_SOCIETARIOS,
  TIPO_SOCIETARIO_LABEL,
  UBICACION_LABEL,
  UMBRAL_FOLIOS,
  diasHasta,
  fmtFecha,
  foliosLibres,
  organismoSugerido,
  vencimientoMandato,
} from "@/lib/libros";
import type {
  ClienteSocietario,
  Libro,
  LibroCatalogo,
  OrganismoSocietario,
  TipoSocietario,
} from "@/types";
import { guardarSocietario } from "../../actions";
import { LibroModal, NuevoTomoModal } from "./LibroModales";

type ClienteBasico = { id: string; nombre: string; cuit: string; jurisdiccion_legal: string | null };

const LABEL = "text-xs font-medium text-gray-500 block mb-1";
const INPUT =
  "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-500 bg-white";
const TH = "text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-2.5";

function Campo({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold tracking-[.08em] uppercase text-gray-400">{label}</p>
      <div className="text-[13px] text-gray-800 mt-0.5">{value || "—"}</div>
    </div>
  );
}

function Tarjeta({ titulo, accion, children }: { titulo: string; accion?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-gray-200 rounded-xl">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <h2 className="text-[11px] font-semibold tracking-[.1em] uppercase text-gray-500">{titulo}</h2>
        {accion}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function MandatoBadge({ vence }: { vence: string }) {
  const dias = diasHasta(vence);
  const [texto, cls] =
    dias < 0
      ? [`Vencido hace ${-dias} días`, "bg-red-50 text-red-600"]
      : dias <= 30
        ? [`Vence en ${dias} días`, "bg-red-50 text-red-600"]
        : dias <= 60
          ? [`Vence en ${dias} días`, "bg-orange-50 text-orange-600"]
          : dias <= 90
            ? [`Vence en ${dias} días`, "bg-amber-50 text-amber-700"]
            : [`Vigente`, "bg-gray-100 text-gray-500"];
  return <span className={clsx("text-[11px] font-medium rounded-full px-2 py-0.5 ml-2", cls)}>{texto}</span>;
}

function DatosSocietarios({
  cliente,
  societario,
  tieneLibrosCargados,
  puedeEditar,
}: {
  cliente: ClienteBasico;
  societario: ClienteSocietario | null;
  tieneLibrosCargados: boolean;
  puedeEditar: boolean;
}) {
  const sugerido = organismoSugerido(cliente.jurisdiccion_legal);
  const [editando, setEditando] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [tipo, setTipo] = useState<TipoSocietario | "">(societario?.tipo_societario ?? "");
  const [organismo, setOrganismo] = useState<OrganismoSocietario | "">(societario?.organismo ?? sugerido ?? "");
  const [nroInscripcion, setNroInscripcion] = useState(societario?.nro_inscripcion ?? "");
  const [digitales, setDigitales] = useState(societario?.libros_digitales ?? false);
  const [contacto, setContacto] = useState(societario?.contacto_libros ?? "");
  const [designacion, setDesignacion] = useState(societario?.mandato_designacion ?? "");
  const [anios, setAnios] = useState(societario?.mandato_anios?.toString() ?? "");
  const [observaciones, setObservaciones] = useState(societario?.observaciones ?? "");

  const vence = vencimientoMandato(societario?.mandato_designacion ?? null, societario?.mandato_anios ?? null);

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const nAnios = anios.trim() === "" ? null : Number(anios);
    if (nAnios != null && (!Number.isInteger(nAnios) || nAnios < 1)) {
      return setError("Los años de mandato tienen que ser un número entero mayor a 0 (vacío = indeterminado).");
    }
    startTransition(async () => {
      const res = await guardarSocietario(cliente.id, {
        tipo_societario: tipo || null,
        organismo: organismo || null,
        nro_inscripcion: nroInscripcion.trim() || null,
        libros_digitales: digitales,
        contacto_libros: contacto.trim() || null,
        mandato_designacion: designacion || null,
        mandato_anios: nAnios,
        observaciones: observaciones.trim() || null,
      });
      if (res.error) return setError(res.error);
      setEditando(false);
    });
  }

  if (!editando) {
    return (
      <Tarjeta
        titulo="Datos societarios"
        accion={
          puedeEditar && (
            <button
              onClick={() => setEditando(true)}
              className="flex items-center gap-1.5 text-[12px] font-medium text-gray-500 hover:text-violet-700"
            >
              <Pencil size={13} /> Editar
            </button>
          )
        }
      >
        {!societario ? (
          <p className="text-[13px] text-gray-400">
            Todavía no se cargaron los datos societarios de este cliente.
            {puedeEditar && " Tocá Editar para cargar el tipo societario: con eso aparecen los libros que le corresponden."}
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Campo label="Tipo societario" value={societario.tipo_societario && TIPO_SOCIETARIO_LABEL[societario.tipo_societario]} />
            <Campo label="Organismo" value={societario.organismo} />
            <Campo label="Nº de inscripción" value={societario.nro_inscripcion} />
            <Campo label="Libros digitales" value={societario.libros_digitales ? "Sí" : "No"} />
            <Campo label="Contacto para libros" value={societario.contacto_libros} />
            <Campo label="Designación de autoridades" value={fmtFecha(societario.mandato_designacion)} />
            <Campo
              label="Duración del mandato"
              value={societario.mandato_anios ? `${societario.mandato_anios} años` : "Indeterminado"}
            />
            <Campo
              label="Vencimiento del mandato"
              value={vence ? <>{fmtFecha(vence)}<MandatoBadge vence={vence} /></> : "—"}
            />
            {societario.observaciones && (
              <div className="col-span-2 md:col-span-4">
                <Campo label="Observaciones" value={<span className="whitespace-pre-wrap">{societario.observaciones}</span>} />
              </div>
            )}
          </div>
        )}
      </Tarjeta>
    );
  }

  return (
    <Tarjeta titulo="Datos societarios">
      <form onSubmit={guardar} className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className={LABEL}>Tipo societario</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoSocietario | "")} className={INPUT}>
              <option value="">Sin definir</option>
              {TIPOS_SOCIETARIOS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Organismo</label>
            <select
              value={organismo}
              onChange={(e) => setOrganismo(e.target.value as OrganismoSocietario | "")}
              className={INPUT}
            >
              <option value="">Sin definir</option>
              {ORGANISMOS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {sugerido && (
              <p className="text-[11px] text-gray-400 mt-1">
                Sugerido: {sugerido} (jurisdicción legal: {cliente.jurisdiccion_legal})
              </p>
            )}
          </div>
          <div>
            <label className={LABEL}>Nº de inscripción</label>
            <input value={nroInscripcion} onChange={(e) => setNroInscripcion(e.target.value)} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Libros digitales</label>
            <select
              value={digitales ? "si" : "no"}
              onChange={(e) => setDigitales(e.target.value === "si")}
              className={INPUT}
            >
              <option value="no">No</option>
              <option value="si">Sí</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className={LABEL}>Contacto para libros</label>
            <input
              value={contacto}
              onChange={(e) => setContacto(e.target.value)}
              placeholder="Nombre, teléfono o mail de quien entrega/recibe los libros"
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL}>Designación de autoridades</label>
            <input type="date" value={designacion} onChange={(e) => setDesignacion(e.target.value)} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Mandato (años)</label>
            <input
              type="number"
              min={1}
              value={anios}
              onChange={(e) => setAnios(e.target.value)}
              placeholder="Vacío = indeterminado"
              className={INPUT}
            />
          </div>
          <div className="col-span-2 md:col-span-4">
            <label className={LABEL}>Observaciones</label>
            <textarea rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} className={INPUT} />
          </div>
        </div>

        {tieneLibrosCargados && tipo !== (societario?.tipo_societario ?? "") && (
          <p className="text-[12px] text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            Cambiar el tipo societario no borra los libros ya cargados: los que no correspondan al tipo nuevo
            pasan a la lista &ldquo;Libros de otro tipo societario&rdquo;.
          </p>
        )}
        {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setEditando(false)}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 rounded-lg"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pendiente}
            className="px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg disabled:opacity-50"
          >
            {pendiente ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </Tarjeta>
  );
}

type GrupoLibro = { item: LibroCatalogo; vigente: Libro | null; anteriores: Libro[]; ultimoCopiado: string | null };

function agrupar(item: LibroCatalogo, libros: Libro[]): GrupoLibro {
  const tomos = libros.filter((l) => l.catalogo_id === item.id).sort((a, b) => b.tomo - a.tomo);
  const vigente =
    tomos.find((l) => l.estado === "activo") ?? tomos.find((l) => l.estado === "sin_libro") ?? tomos[0] ?? null;
  const ultimoCopiado =
    tomos.map((l) => l.ultimo_periodo_copiado).filter((v): v is string => !!v).sort().at(-1) ?? null;
  return { item, vigente, anteriores: tomos.filter((l) => l !== vigente), ultimoCopiado };
}

function FilaLibro({
  libro,
  item,
  ultimoCopiado,
  esAnterior,
  cantAnteriores,
  verAnteriores,
  onToggleAnteriores,
  puedeEditar,
  onCargar,
  onEditar,
  onNuevoTomo,
}: {
  libro: Libro | null;
  item: LibroCatalogo;
  ultimoCopiado: string | null;
  esAnterior?: boolean;
  cantAnteriores?: number;
  verAnteriores?: boolean;
  onToggleAnteriores?: () => void;
  puedeEditar: boolean;
  onCargar: () => void;
  onEditar: (l: Libro) => void;
  onNuevoTomo: (l: Libro) => void;
}) {
  const libres = libro ? foliosLibres(libro.folios_totales, libro.folios_usados) : null;
  const periodicidad = libro?.periodicidad ?? item.periodicidad;

  return (
    <tr className={clsx("transition-colors", esAnterior ? "bg-gray-50/60 text-gray-400" : "hover:bg-violet-50/40")}>
      <td className="px-5 py-2.5">
        {esAnterior ? (
          <p className="text-[12px] text-gray-400 pl-4">↳ Tomo anterior</p>
        ) : (
          <>
            <p className="text-[13px] font-medium text-gray-800">{item.nombre}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {item.dispara_con_balance && <span className="text-[10px] text-violet-600">Sale con el balance</span>}
              {!!cantAnteriores && (
                <button onClick={onToggleAnteriores} className="text-[10px] text-gray-400 hover:text-gray-700 underline">
                  {verAnteriores ? "Ocultar" : "Ver"} tomos anteriores ({cantAnteriores})
                </button>
              )}
            </div>
          </>
        )}
      </td>
      {!libro ? (
        <>
          <td colSpan={9} className="px-3 py-2.5 text-[12px] text-gray-400 italic">Sin cargar</td>
          <td className="px-3 py-2.5 text-right">
            {puedeEditar && (
              <button
                onClick={onCargar}
                className="inline-flex items-center gap-1 text-[12px] font-medium text-violet-700 hover:text-violet-900"
              >
                <Plus size={13} /> Cargar
              </button>
            )}
          </td>
        </>
      ) : (
        <>
          <td className="px-3 py-2.5 text-center text-[12px]">{libro.tomo}</td>
          <td className="px-3 py-2.5 text-center">
            <span className={clsx("text-[11px] font-medium rounded-full px-2 py-0.5", ESTADO_LIBRO[libro.estado].cls)}>
              {ESTADO_LIBRO[libro.estado].label}
            </span>
          </td>
          <td className="px-3 py-2.5 text-[12px]">{SOPORTE_LABEL[libro.soporte]}</td>
          <td className="px-3 py-2.5 text-[12px]">
            {libro.rubrica_nro || libro.rubrica_fecha ? (
              <>
                {libro.rubrica_nro ?? "s/n"}
                <span className="text-gray-400"> · {fmtFecha(libro.rubrica_fecha)}</span>
              </>
            ) : (
              "—"
            )}
          </td>
          <td className="px-3 py-2.5 text-center text-[12px]">
            {libro.folios_totales != null ? `${libro.folios_usados} / ${libro.folios_totales}` : "—"}
          </td>
          <td className="px-3 py-2.5 text-center">
            {libres == null ? (
              <span className="text-[12px] text-gray-300">—</span>
            ) : (
              <span
                className={clsx(
                  "text-[12px] font-medium",
                  !esAnterior && libro.estado === "activo" && libres <= UMBRAL_FOLIOS ? "text-red-600" : "text-gray-700",
                  esAnterior && "text-gray-400"
                )}
              >
                {libres}
              </span>
            )}
          </td>
          <td className="px-3 py-2.5 text-center text-[12px]">
            {fmtFecha(esAnterior ? libro.ultimo_periodo_copiado : ultimoCopiado)}
          </td>
          <td className="px-3 py-2.5 text-[12px]">
            {PERIODICIDAD_LABEL[periodicidad]}
            {libro.periodicidad && <span className="text-violet-600" title="Frecuencia propia de este cliente"> *</span>}
          </td>
          <td className="px-3 py-2.5 text-[12px]">
            {libro.ubicacion === "otro" && libro.ubicacion_detalle
              ? libro.ubicacion_detalle
              : UBICACION_LABEL[libro.ubicacion]}
          </td>
          <td className="px-3 py-2.5 text-right">
            <div className="flex items-center justify-end gap-3">
              {puedeEditar && (
                <button onClick={() => onEditar(libro)} title="Editar" className="text-gray-400 hover:text-violet-700">
                  <Pencil size={13} />
                </button>
              )}
              {puedeEditar && !esAnterior && libro.estado !== "sin_libro" && (
                <button
                  onClick={() => onNuevoTomo(libro)}
                  className="text-[12px] font-medium text-violet-700 hover:text-violet-900"
                >
                  Nuevo tomo
                </button>
              )}
              {!esAnterior && (
                <button
                  disabled
                  title="El historial de copiados se habilita con el Seguimiento del módulo"
                  className="text-gray-300 cursor-not-allowed"
                >
                  <History size={13} />
                </button>
              )}
            </div>
          </td>
        </>
      )}
    </tr>
  );
}

export function FichaSocietarioClient({
  cliente,
  responsable,
  servicioActivo,
  societario,
  catalogo,
  libros,
  puedeEditar,
}: {
  cliente: ClienteBasico;
  responsable: string | null;
  servicioActivo: boolean;
  societario: ClienteSocietario | null;
  catalogo: LibroCatalogo[];
  libros: Libro[];
  puedeEditar: boolean;
}) {
  const [cargando, setCargando] = useState<LibroCatalogo | null>(null);
  const [editando, setEditando] = useState<{ item: LibroCatalogo; libro: Libro } | null>(null);
  const [nuevoTomo, setNuevoTomo] = useState<{ item: LibroCatalogo; libro: Libro } | null>(null);
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());

  const tipo = societario?.tipo_societario ?? null;
  const corresponden = tipo ? catalogo.filter((k) => k.tipo_societario === tipo) : [];
  const grupos = corresponden.map((k) => agrupar(k, libros));
  const idsCorresponden = new Set(corresponden.map((k) => k.id));
  const otros = catalogo
    .filter((k) => !idsCorresponden.has(k.id) && libros.some((l) => l.catalogo_id === k.id))
    .map((k) => agrupar(k, libros));

  const vigentes = grupos.map((g) => g.vigente).filter((l): l is Libro => !!l && l.estado !== "cerrado");
  const resumen = {
    corresponden: corresponden.length,
    cargados: vigentes.length,
    sinLibro: vigentes.filter((l) => l.estado === "sin_libro").length,
    pocosFolios: vigentes.filter((l) => {
      const libres = foliosLibres(l.folios_totales, l.folios_usados);
      return l.estado === "activo" && libres != null && libres <= UMBRAL_FOLIOS;
    }).length,
    enCliente: vigentes.filter((l) => l.estado === "activo" && l.ubicacion === "cliente").length,
    enCopiadora: vigentes.filter((l) => l.estado === "activo" && l.ubicacion === "copiadora").length,
  };

  function toggle(id: string) {
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function filas(g: GrupoLibro) {
    const abierto = abiertos.has(g.item.id);
    return (
      <Fragment key={g.item.id}>
        <FilaLibro
          libro={g.vigente}
          item={g.item}
          ultimoCopiado={g.ultimoCopiado}
          cantAnteriores={g.anteriores.length}
          verAnteriores={abierto}
          onToggleAnteriores={() => toggle(g.item.id)}
          puedeEditar={puedeEditar}
          onCargar={() => setCargando(g.item)}
          onEditar={(libro) => setEditando({ item: g.item, libro })}
          onNuevoTomo={(libro) => setNuevoTomo({ item: g.item, libro })}
        />
        {abierto &&
          g.anteriores.map((l) => (
            <FilaLibro
              key={l.id}
              libro={l}
              item={g.item}
              ultimoCopiado={l.ultimo_periodo_copiado}
              esAnterior
              puedeEditar={puedeEditar}
              onCargar={() => {}}
              onEditar={(libro) => setEditando({ item: g.item, libro })}
              onNuevoTomo={() => {}}
            />
          ))}
      </Fragment>
    );
  }

  const encabezado = (
    <thead>
      <tr className="bg-gray-50 border-b border-gray-200">
        <th className={clsx(TH, "text-left px-5")}>Libro</th>
        <th className={clsx(TH, "text-center")}>Tomo</th>
        <th className={clsx(TH, "text-center")}>Estado</th>
        <th className={clsx(TH, "text-left")}>Soporte</th>
        <th className={clsx(TH, "text-left")}>Rúbrica</th>
        <th className={clsx(TH, "text-center")}>Folios</th>
        <th className={clsx(TH, "text-center")}>Libres</th>
        <th className={clsx(TH, "text-center")}>Último copiado</th>
        <th className={clsx(TH, "text-left")}>Frecuencia</th>
        <th className={clsx(TH, "text-left")}>Ubicación</th>
        <th className={TH} />
      </tr>
    </thead>
  );

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
        <Link href="/libros/clientes" className="inline-flex items-center gap-1 text-[12px] text-gray-400 hover:text-gray-700 mb-2">
          <ArrowLeft size={12} /> Clientes
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-2 h-6 rounded-full bg-violet-500" />
          <div>
            <h1 className="text-[17px] font-semibold text-gray-900">{cliente.nombre}</h1>
            <p className="text-[12px] text-gray-400 mt-0.5">
              CUIT {cliente.cuit} · Responsable de Libros: {responsable ?? "sin asignar"}
              {!servicioActivo && <span className="text-amber-600"> · Servicio Libros no activo</span>}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-6 space-y-5 max-w-[1400px]">
          <DatosSocietarios
            key={societario?.actualizado_en ?? "nuevo"}
            cliente={cliente}
            societario={societario}
            tieneLibrosCargados={libros.length > 0}
            puedeEditar={puedeEditar}
          />

          {tipo && (
            <Tarjeta titulo="Resumen">
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-[12px]">
                <span className="text-gray-500">
                  <span className="font-semibold text-gray-800">{resumen.cargados}</span> de {resumen.corresponden} libros cargados
                </span>
                <span className={resumen.sinLibro ? "text-red-600" : "text-gray-400"}>
                  <span className="font-semibold">{resumen.sinLibro}</span> sin libro
                </span>
                <span className={resumen.pocosFolios ? "text-red-600" : "text-gray-400"}>
                  <span className="font-semibold">{resumen.pocosFolios}</span> con {UMBRAL_FOLIOS} folios libres o menos
                </span>
                <span className="text-gray-400">
                  <span className="font-semibold">{resumen.enCliente}</span> en el cliente
                </span>
                <span className="text-gray-400">
                  <span className="font-semibold">{resumen.enCopiadora}</span> en la copiadora
                </span>
              </div>
            </Tarjeta>
          )}

          <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <h2 className="text-[11px] font-semibold tracking-[.1em] uppercase text-gray-500">
                Libros {tipo && `· ${TIPO_SOCIETARIO_LABEL[tipo]}`}
              </h2>
            </div>
            {!tipo ? (
              <p className="px-5 py-6 text-[13px] text-gray-400">
                Cargá el tipo societario en &ldquo;Datos societarios&rdquo; para ver qué libros le corresponden.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap">
                  {encabezado}
                  <tbody className="divide-y divide-gray-100">{grupos.map(filas)}</tbody>
                </table>
              </div>
            )}
          </section>

          {otros.length > 0 && (
            <section className="bg-white border border-amber-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-amber-100 bg-amber-50/50">
                <h2 className="text-[11px] font-semibold tracking-[.1em] uppercase text-amber-700">
                  Libros de otro tipo societario
                </h2>
                <p className="text-[11px] text-amber-700/80 mt-0.5">
                  Cargados cuando el cliente tenía otro tipo. No cuentan en el resumen.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap">
                  {encabezado}
                  <tbody className="divide-y divide-gray-100">{otros.map(filas)}</tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </div>

      {cargando && (
        <LibroModal
          clienteId={cliente.id}
          item={cargando}
          libro={null}
          soporteDefault={societario?.libros_digitales ? "digital" : "fisico"}
          onClose={() => setCargando(null)}
        />
      )}
      {editando && (
        <LibroModal
          clienteId={cliente.id}
          item={editando.item}
          libro={editando.libro}
          soporteDefault={editando.libro.soporte}
          onClose={() => setEditando(null)}
        />
      )}
      {nuevoTomo && (
        <NuevoTomoModal item={nuevoTomo.item} libro={nuevoTomo.libro} onClose={() => setNuevoTomo(null)} />
      )}
    </div>
  );
}
