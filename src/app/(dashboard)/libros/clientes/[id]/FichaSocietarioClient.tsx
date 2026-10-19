"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ArrowLeft, Pencil, Plus } from "lucide-react";
import {
  ESTADO_LIBRO,
  ORGANISMOS,
  PERIODICIDAD_LABEL,
  SOPORTE_LABEL,
  TIPOS_SOCIETARIOS,
  TIPO_SOCIETARIO_LABEL,
  UBICACION_LABEL,
  diasHasta,
  fmtFecha,
  foliosLibres,
  atrasoLibro,
  textoPeriodos,
  organismoSugerido,
  periodoExigible,
  vencimientoFinal,
} from "@/lib/libros";
import { MandatoCampos, aDatosMandato, valoresIniciales } from "../../MandatoCampos";
import type {
  ClienteSocietario,
  Libro,
  LibroCatalogo,
  OrganismoSocietario,
  TipoSocietario,
} from "@/types";
import { ESTADO_BALANCE } from "../../../contable/semaforo";
import { guardarSocietario } from "../../actions";
import { INPUT, LABEL } from "../../ModalBase";
import {
  AVISO,
  BOTON_PRIMARIO,
  BOTON_SECUNDARIO,
  BOTON_TEXTO,
  CHIP,
  ERROR,
  MONO,
  NUM,
  PAGINA,
  PANEL,
  PANEL_CABECERA,
  RAYA_MODULO,
  SEMAFORO,
  TH,
  TITULO,
  VACIO,
  VACIO_TEXTO,
} from "../../ui";
import { LibroModal, NuevoTomoModal } from "./LibroModales";
import { HistorialLibroModal } from "./HistorialLibroModal";
import { NuevaTareaModal, type Persona } from "../../NuevaTareaModal";

type ClienteBasico = {
  id: string;
  nombre: string;
  cuit: string;
  jurisdiccion_legal: string | null;
  cierre_ejercicio_mes: number | null;
  cierre_ejercicio_dia: number | null;
};

const ETIQUETA = "inline-block ml-1.5 rounded-md px-1.5 py-px text-[10.5px] font-semibold bg-bordo-tint2 text-bordo";
const CABECERA_DATO = "text-[10.5px] font-semibold tracking-[0.08em] uppercase text-ink-subtle";

function Campo({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className={CABECERA_DATO}>{label}</p>
      <div className={clsx("text-[13px] text-ink mt-0.5", mono && MONO)}>{value || "—"}</div>
    </div>
  );
}

function DatosSocietarios({
  cliente,
  societario,
  tieneLibrosCargados,
  editando,
  setEditando,
}: {
  cliente: ClienteBasico;
  societario: ClienteSocietario | null;
  tieneLibrosCargados: boolean;
  editando: boolean;
  setEditando: (v: boolean) => void;
}) {
  const sugerido = organismoSugerido(cliente.jurisdiccion_legal);
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [tipo, setTipo] = useState<TipoSocietario | "">(societario?.tipo_societario ?? "");
  const [organismo, setOrganismo] = useState<OrganismoSocietario | "">(societario?.organismo ?? sugerido ?? "");
  const [nroInscripcion, setNroInscripcion] = useState(societario?.nro_inscripcion ?? "");
  const [digitales, setDigitales] = useState(societario?.libros_digitales ?? false);
  const [contacto, setContacto] = useState(societario?.contacto_libros ?? "");
  const [mandato, setMandato] = useState(() => valoresIniciales(societario, societario?.tipo_societario));
  const [observaciones, setObservaciones] = useState(societario?.observaciones ?? "");

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const datosMandato = aDatosMandato(mandato);
    if (typeof datosMandato === "string") return setError(datosMandato);
    startTransition(async () => {
      const res = await guardarSocietario(cliente.id, {
        tipo_societario: tipo || null,
        organismo: organismo || null,
        nro_inscripcion: nroInscripcion.trim() || null,
        libros_digitales: digitales,
        contacto_libros: contacto.trim() || null,
        ...datosMandato,
        observaciones: observaciones.trim() || null,
      });
      if (res.error) return setError(res.error);
      setEditando(false);
    });
  }

  const cabecera = () => (
    <div className={clsx("px-4 py-2.5 rounded-t-xl", PANEL_CABECERA)}>
      <h2 className="font-archivo text-[14px] font-bold text-ink">Datos societarios</h2>
    </div>
  );

  if (!editando) {
    if (!societario) return null;
    return (
      <section className={PANEL}>
        {cabecera()}
        <div className="px-4 py-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <Campo label="Nº de inscripción" value={societario.nro_inscripcion} mono />
          <Campo label="Libros digitales" value={societario.libros_digitales ? "Sí" : "No"} />
          <Campo label="Designación de autoridades" value={fmtFecha(societario.mandato_designacion)} mono />
          <Campo
            label="Duración del mandato"
            value={
              societario.mandato_vence_preciso
                ? `Vence el ${fmtFecha(societario.mandato_vence_preciso)} (preciso)`
                : societario.mandato_anios
                  ? `${societario.mandato_anios} años`
                  : "Indeterminado"
            }
          />
          <div className="col-span-2">
            <Campo label="Contacto para libros" value={societario.contacto_libros} />
          </div>
          {societario.observaciones && (
            <div className="col-span-2">
              <Campo label="Observaciones" value={<span className="whitespace-pre-wrap">{societario.observaciones}</span>} />
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className={PANEL}>
      {cabecera()}
      <form onSubmit={guardar} className="px-4 py-4 space-y-4">
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
              <p className="text-[11px] text-ink-subtle mt-1">
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
          <MandatoCampos
            valores={mandato}
            onChange={(v) => setMandato(v)}
          />
          <div className="col-span-2 md:col-span-4">
            <label className={LABEL}>Observaciones</label>
            <textarea rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} className={INPUT} />
          </div>
        </div>

        {tieneLibrosCargados && tipo !== (societario?.tipo_societario ?? "") && (
          <p className={AVISO}>
            Cambiar el tipo societario no borra los libros ya cargados: los que no correspondan al tipo nuevo
            pasan a la lista &ldquo;Libros de otro tipo societario&rdquo;.
          </p>
        )}
        {error && <p className={ERROR}>{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setEditando(false)} className={BOTON_TEXTO}>
            Cancelar
          </button>
          <button type="submit" disabled={pendiente} className={BOTON_PRIMARIO}>
            {pendiente ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </section>
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

type Cierre = { mes: number | null; dia: number | null };

/** Estado del libro con el semáforo: al día, atrasado, sin dato o sin atraso calculable. */
function estadoLibro(g: GrupoLibro, cierre: Cierre): { label: string; cls: string } {
  const l = g.vigente;
  if (!l) return { label: "Sin cargar", cls: SEMAFORO.sinDato };
  if (l.estado === "cerrado") return { label: ESTADO_LIBRO.cerrado.label, cls: SEMAFORO.sinDato };
  if (l.estado === "sin_libro") return { label: ESTADO_LIBRO.sin_libro.label, cls: SEMAFORO.rojo };
  const periodicidad = l.periodicidad ?? g.item.periodicidad;
  if (periodicidad === "evento") return { label: "Sin atraso calculable", cls: SEMAFORO.sinDato };
  if (!g.ultimoCopiado) return { label: "Sin dato", cls: SEMAFORO.sinDato };
  const r = atrasoLibro(l, g.ultimoCopiado, periodicidad, cierre);
  return r.estado === "atrasado"
    ? { label: `Atrasado · faltan ${textoPeriodos(r.periodos, periodicidad)}`, cls: SEMAFORO.rojo }
    : { label: "Al día", cls: SEMAFORO.verdeClaro };
}

/** Tomo, soporte y frecuencia solo cuando no son lo habitual. */
function etiquetas(libro: Libro, item: LibroCatalogo): string[] {
  const out: string[] = [];
  if (libro.tomo !== 1) out.push(`Tomo ${libro.tomo}`);
  if (libro.soporte === "digital") out.push(SOPORTE_LABEL.digital);
  if (libro.periodicidad && libro.periodicidad !== item.periodicidad) out.push(PERIODICIDAD_LABEL[libro.periodicidad]);
  return out;
}

function FilaLibro({
  grupo,
  libro,
  esAnterior,
  verAnteriores,
  onToggleAnteriores,
  cierre,
  umbral,
  puedeEditar,
  enCola,
  onCargar,
  onEditar,
  onNuevoTomo,
  onHistorial,
  onNuevaTarea,
}: {
  grupo: GrupoLibro;
  libro: Libro | null;
  esAnterior?: boolean;
  verAnteriores?: boolean;
  onToggleAnteriores?: () => void;
  cierre: Cierre;
  umbral: number;
  puedeEditar: boolean;
  enCola?: boolean;
  onCargar: () => void;
  onEditar: (l: Libro) => void;
  onNuevoTomo: (l: Libro) => void;
  onHistorial?: (l: Libro) => void;
  onNuevaTarea?: (l: Libro) => void;
}) {
  const item = grupo.item;
  const libres = libro ? foliosLibres(libro.folios_totales, libro.folios_usados) : null;
  const estado = esAnterior
    ? { label: ESTADO_LIBRO.cerrado.label, cls: SEMAFORO.sinDato }
    : estadoLibro(grupo, cierre);
  const bajo = !esAnterior && libro?.estado === "activo" && libres != null && libres <= umbral;
  const rubrica =
    libro && (libro.rubrica_nro || libro.rubrica_fecha)
      ? `Rúbrica ${libro.rubrica_nro ?? "s/n"} · ${fmtFecha(libro.rubrica_fecha)}`
      : undefined;

  return (
    <tr className={clsx("border-t border-line-row align-top", esAnterior ? "bg-paper-alt text-ink-subtle" : "hover:bg-paper-hover")}>
      <td className="px-4 py-2.5 whitespace-normal">
        {esAnterior ? (
          <p className="text-[12px] text-ink-subtle pl-3">↳ Tomo {libro?.tomo} (cerrado)</p>
        ) : (
          <>
            <p className="text-[13px] font-semibold text-ink" title={rubrica}>
              {item.nombre}
              {libro && etiquetas(libro, item).map((e) => (
                <span key={e} className={ETIQUETA}>{e}</span>
              ))}
            </p>
            {grupo.anteriores.length > 0 && (
              <button onClick={onToggleAnteriores} className="text-[11px] text-ink-subtle hover:text-ink underline">
                {verAnteriores ? "Ocultar" : "Ver"} tomos anteriores ({grupo.anteriores.length})
              </button>
            )}
          </>
        )}
      </td>
      <td className={clsx(NUM, "px-3 py-2.5")}>
        {libro ? fmtFecha(esAnterior ? libro.ultimo_periodo_copiado : grupo.ultimoCopiado) : "—"}
      </td>
      <td className="px-3 py-2.5">
        <span className={clsx(CHIP, estado.cls)}>{estado.label}</span>
      </td>
      <td className={clsx(NUM, "px-3 py-2.5", bajo && "text-orange-700 font-semibold")}>
        {libres == null ? "—" : `${libres} / ${libro!.folios_totales}`}
      </td>
      <td className="hidden md:table-cell px-3 py-2.5 text-[12px] text-ink-muted">
        {!libro
          ? "—"
          : libro.ubicacion === "otro" && libro.ubicacion_detalle
            ? libro.ubicacion_detalle
            : UBICACION_LABEL[libro.ubicacion]}
      </td>
      <td className="px-4 py-2 text-right whitespace-nowrap">
        {!libro ? (
          puedeEditar && (
            <button onClick={onCargar} className={clsx(BOTON_TEXTO, "text-bordo hover:text-bordo-dark")}>
              <Plus size={13} /> Cargar
            </button>
          )
        ) : (
          <div className="inline-flex items-center justify-end gap-3">
            {!esAnterior && libro.estado !== "cerrado" && enCola && (
              <Link href="/libros" className={clsx(CHIP, SEMAFORO.verdeClaro)}>
                En cola
              </Link>
            )}
            {puedeEditar && !esAnterior && libro.estado !== "cerrado" && !enCola && onNuevaTarea && (
              <button onClick={() => onNuevaTarea(libro)} className={BOTON_TEXTO} title="Agregar a la cola de trabajo">
                <Plus size={12} /> Tarea
              </button>
            )}
            {puedeEditar && !esAnterior && libro.estado !== "sin_libro" && (
              <button onClick={() => onNuevoTomo(libro)} className={BOTON_TEXTO}>
                Nuevo tomo
              </button>
            )}
            {!esAnterior && onHistorial && (
              <button onClick={() => onHistorial(libro)} className={BOTON_TEXTO}>
                Historial
              </button>
            )}
            {puedeEditar && (
              <button
                onClick={() => onEditar(libro)}
                aria-label={`Editar ${item.nombre} tomo ${libro.tomo}`}
                className="text-ink-subtle hover:text-ink"
              >
                <Pencil size={13} />
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

function Dato({ titulo, children, ultimo }: { titulo: string; children: React.ReactNode; ultimo?: boolean }) {
  return (
    <div
      className={clsx(
        "flex-1 basis-[150px] px-4 py-3 flex flex-col gap-1 border-line-row",
        !ultimo && "border-b sm:border-b-0 sm:border-r"
      )}
    >
      <span className={CABECERA_DATO}>{titulo}</span>
      {children}
    </div>
  );
}

const CIFRA = "font-archivo text-[20px] font-extrabold tabular-nums leading-none";

export function FichaSocietarioClient({
  cliente,
  responsable,
  servicioActivo,
  societario,
  catalogo,
  libros,
  puedeEditar,
  responsableId,
  enCola,
  equipo,
  balance,
  umbralFolios,
  primerAvisoMandato,
}: {
  cliente: ClienteBasico;
  responsable: string | null;
  servicioActivo: boolean;
  societario: ClienteSocietario | null;
  catalogo: LibroCatalogo[];
  libros: Libro[];
  puedeEditar: boolean;
  responsableId: string | null;
  enCola: string[];
  equipo: Persona[];
  balance: { anio_fiscal: number; estado: string } | null;
  umbralFolios: number;
  primerAvisoMandato: number;
}) {
  const [editandoDatos, setEditandoDatos] = useState(false);
  const [cargando, setCargando] = useState<LibroCatalogo | null>(null);
  const [editando, setEditando] = useState<{ item: LibroCatalogo; libro: Libro } | null>(null);
  const [nuevoTomo, setNuevoTomo] = useState<{ item: LibroCatalogo; libro: Libro } | null>(null);
  const [historialDe, setHistorialDe] = useState<{ item: LibroCatalogo; libro: Libro } | null>(null);
  const [tareaPara, setTareaPara] = useState<{ item: LibroCatalogo; libro: Libro } | null>(null);
  const librosEnCola = new Set(enCola);
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());

  const cierre: Cierre = { mes: cliente.cierre_ejercicio_mes, dia: cliente.cierre_ejercicio_dia };
  const tipo = societario?.tipo_societario ?? null;
  const corresponden = tipo ? catalogo.filter((k) => k.tipo_societario === tipo) : [];
  const grupos = corresponden.map((k) => agrupar(k, libros));
  const idsCorresponden = new Set(corresponden.map((k) => k.id));
  const otros = catalogo
    .filter((k) => !idsCorresponden.has(k.id) && libros.some((l) => l.catalogo_id === k.id))
    .map((k) => agrupar(k, libros));

  // Por evento = no tiene atraso calculable (periodicidad 'evento', propia o del
  // catálogo). El resto (anual y trimestral) se pone al día con el balance.
  const esEvento = (g: GrupoLibro) => (g.vigente?.periodicidad ?? g.item.periodicidad) === "evento";
  const anuales = grupos.filter((g) => !esEvento(g));
  const porEvento = grupos.filter(esEvento);

  const cargados = grupos.filter((g) => g.vigente && g.vigente.estado !== "cerrado");
  const calculables = cargados.filter((g) => g.vigente!.estado !== "sin_libro" && !esEvento(g));
  const alDia = calculables.filter((g) => estadoLibro(g, cierre).label === "Al día").length;
  const foliosBajos = cargados.filter((g) => {
    const l = g.vigente!;
    const libres = foliosLibres(l.folios_totales, l.folios_usados);
    return l.estado === "activo" && libres != null && libres <= umbralFolios;
  }).length;
  const sinCargar = grupos.length - cargados.length;
  const exigible = periodoExigible("balance", cierre);

  const vence = vencimientoFinal(societario);
  const diasMandato = vence ? diasHasta(vence) : null;
  const mandatoSinCargar =
    (tipo === "SA" || tipo === "SAS") && !societario?.mandato_designacion && !societario?.mandato_vence_preciso;
  const infoBalance = balance ? ESTADO_BALANCE[balance.estado] : undefined;

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
          grupo={g}
          libro={g.vigente}
          verAnteriores={abierto}
          onToggleAnteriores={() => toggle(g.item.id)}
          cierre={cierre}
          umbral={umbralFolios}
          puedeEditar={puedeEditar}
          enCola={!!g.vigente && librosEnCola.has(g.vigente.id)}
          onCargar={() => setCargando(g.item)}
          onEditar={(libro) => setEditando({ item: g.item, libro })}
          onNuevoTomo={(libro) => setNuevoTomo({ item: g.item, libro })}
          onHistorial={(libro) => setHistorialDe({ item: g.item, libro })}
          onNuevaTarea={(libro) => setTareaPara({ item: g.item, libro })}
        />
        {abierto &&
          g.anteriores.map((l) => (
            <FilaLibro
              key={l.id}
              grupo={g}
              libro={l}
              esAnterior
              cierre={cierre}
              umbral={umbralFolios}
              puedeEditar={puedeEditar}
              onCargar={() => {}}
              onEditar={(libro) => setEditando({ item: g.item, libro })}
              onNuevoTomo={() => {}}
            />
          ))}
      </Fragment>
    );
  }

  function tabla(titulo: string, lista: GrupoLibro[], derecha?: React.ReactNode, avisoTipo?: boolean) {
    if (lista.length === 0) return null;
    return (
      <section className={clsx(PANEL, "overflow-hidden", avisoTipo && "border-[#F1DFC2]")}>
        <div
          className={clsx(
            "flex flex-wrap items-center justify-between gap-2 px-4 py-2.5",
            avisoTipo ? "bg-alerta-bg border-b border-[#F1DFC2]" : PANEL_CABECERA
          )}
        >
          <h2 className={clsx("font-archivo text-[14px] font-bold", avisoTipo ? "text-alerta-fg" : "text-ink")}>
            {titulo}
          </h2>
          {derecha}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr>
                <th className={clsx(TH, "text-left px-4")}>Libro</th>
                <th className={clsx(TH, "text-right")}>Copiado hasta</th>
                <th className={clsx(TH, "text-left")}>Estado</th>
                <th className={clsx(TH, "text-right")}>Folios libres</th>
                <th className={clsx(TH, "text-left hidden md:table-cell")}>Dónde está</th>
                <th className={clsx(TH, "px-4")}>
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>{lista.map(filas)}</tbody>
          </table>
        </div>
      </section>
    );
  }

  return (
    <div className={PAGINA}>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-4 sm:px-6 pt-4 pb-10 space-y-4 max-w-[1280px]">
          <Link href="/libros/clientes" className={BOTON_TEXTO}>
            <ArrowLeft size={12} /> Clientes
          </Link>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <span className={RAYA_MODULO} />
                <h1 className={TITULO}>{cliente.nombre}</h1>
                {tipo && (
                  <span className={clsx(CHIP, SEMAFORO.sinDato)}>
                    {TIPO_SOCIETARIO_LABEL[tipo]}
                    {societario?.organismo && ` · ${societario.organismo}`}
                  </span>
                )}
              </div>
              <p className="text-[12px] text-ink-subtle mt-1 pl-4">
                <span className={MONO}>{cliente.cuit}</span> · Responsable de Libros: {responsable ?? "sin asignar"}
                {!servicioActivo && <span className="text-alerta-fg font-medium"> · Servicio Libros no activo</span>}
              </p>
            </div>
            {puedeEditar && societario && !editandoDatos && (
              <button onClick={() => setEditandoDatos(true)} className={BOTON_SECUNDARIO}>
                <Pencil size={13} /> Editar datos
              </button>
            )}
          </div>

          {tipo && (
            <div className={clsx(PANEL, "flex flex-wrap")}>
              <Dato titulo="Mandato">
                {vence ? (
                  <>
                    <span className="text-[14px] font-semibold">
                      Vence <span className={MONO}>{fmtFecha(vence)}</span>
                    </span>
                    <span
                      className={clsx(
                        "text-[12px] font-medium",
                        diasMandato! < 0 ? "text-red-700" : diasMandato! <= primerAvisoMandato ? "text-orange-700" : "text-green-700"
                      )}
                    >
                      {diasMandato! < 0
                        ? `Vencido hace ${-diasMandato!} días`
                        : diasMandato! <= primerAvisoMandato
                          ? `Por vencer · en ${diasMandato} días`
                          : "Vigente"}
                    </span>
                  </>
                ) : mandatoSinCargar ? (
                  <span className={clsx(CHIP, SEMAFORO.sinDato, "self-start")}>Sin cargar</span>
                ) : (
                  <span className="text-[13px] text-ink-muted">
                    {societario?.mandato_designacion ? "Indeterminado" : "—"}
                  </span>
                )}
              </Dato>
              <Dato titulo="Al día">
                <span className={CIFRA}>
                  {alDia} <span className="text-[13px] font-medium text-ink-muted">de {calculables.length}</span>
                </span>
              </Dato>
              <Dato titulo="Folios bajos">
                <span className={clsx(CIFRA, foliosBajos > 0 && "text-orange-700")}>{foliosBajos}</span>
              </Dato>
              <Dato titulo="Sin cargar">
                <span className={CIFRA}>{sinCargar}</span>
              </Dato>
              <Dato titulo="Balance (Contable)" ultimo>
                {balance && infoBalance ? (
                  <span className={clsx(CHIP, infoBalance.cls, "self-start")}>
                    {balance.anio_fiscal} · {infoBalance.label}
                    {balance.estado === "legalizado" && " · acta pendiente"}
                  </span>
                ) : (
                  <span className="text-[13px] text-ink-muted">—</span>
                )}
              </Dato>
            </div>
          )}

          <DatosSocietarios
            key={societario?.actualizado_en ?? "nuevo"}
            cliente={cliente}
            societario={societario}
            tieneLibrosCargados={libros.length > 0}
            editando={editandoDatos}
            setEditando={setEditandoDatos}
          />

          {!tipo ? (
            !editandoDatos && (
              <div className={clsx(PANEL, VACIO)}>
                <p className={VACIO_TEXTO}>
                  Falta el tipo societario: con eso aparecen los libros que le corresponden a este cliente.
                </p>
                {puedeEditar && (
                  <button onClick={() => setEditandoDatos(true)} className={BOTON_PRIMARIO}>
                    Cargar datos societarios
                  </button>
                )}
              </div>
            )
          ) : (
            <>
              {tabla(
                "Envío anual (con el balance)",
                anuales,
                exigible && (
                  <span className="text-[12px] text-ink-muted">
                    Último cierre exigible: <span className={MONO}>{fmtFecha(exigible)}</span>
                  </span>
                )
              )}
              {tabla("Por evento", porEvento)}
            </>
          )}

          {tabla("Libros de otro tipo societario", otros, undefined, true)}
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
      {historialDe && (
        <HistorialLibroModal
          libroId={historialDe.libro.id}
          titulo={`${historialDe.item.nombre} · ${cliente.nombre}`}
          onClose={() => setHistorialDe(null)}
        />
      )}
      {tareaPara && (
        <NuevaTareaModal
          clienteId={cliente.id}
          clienteNombre={cliente.nombre}
          opciones={[{ id: tareaPara.libro.id, nombre: `${tareaPara.item.nombre} (T${tareaPara.libro.tomo})` }]}
          preseleccionados={[tareaPara.libro.id]}
          origenDefault="manual"
          responsableDefault={responsableId}
          equipo={equipo}
          onClose={() => setTareaPara(null)}
        />
      )}
    </div>
  );
}
