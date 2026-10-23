"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Plus, ChevronDown, Check, Minus, MoreHorizontal } from "lucide-react";
import clsx from "clsx";
import { updateBalance, getFichaCliente } from "./actions";
import { NuevoBalanceModal } from "./NuevoBalanceModal";
import { GenerarBalancesModal } from "./GenerarBalancesModal";
import { MarcaVto } from "./MarcaVto";
import { useBackdropClose } from "@/lib/useBackdropClose";
import type { Vto, VtosBalance } from "@/lib/vencimientosContables";
import { EquipoModuloPanel, EquipoModuloBoton } from "@/components/EquipoModuloPanel";
import { FichaClienteBoton } from "@/components/FichaClienteBoton";
import {
  ESTADO_BALANCE, ESTADO_EECC, avanceBarCls, calcularAvance, calcularEstado,
  ESTADOS_MANUALES, MOTIVOS_NO_CORRESPONDE, cuentaBalance,
  diasDemoraPedido, colorAlertaDemora,
} from "./semaforo";
import { EditarClienteModal } from "../panel-general/EditarClienteModal";
import type { ClaveAcceso, EquipoMiembro } from "@/types";

// Grupos de columnas de la tabla (diseño nuevo): una franja de color suave
// por bloque arriba del encabezado, para orientarse más rápido en una tabla
// ancha. Mismos tonos pastel que ya usa el resto de BOS (emerald/blue/amber/
// violet/orange), nada nuevo inventado.
const GRUPO = {
  fechas: "bg-emerald-50",
  estado: "bg-blue-50",
  etapas: "bg-amber-50",
  formularios: "bg-violet-50",
  igj: "bg-orange-50",
} as const;

// Semáforo de vencimiento para los formularios con fecha (855/899/657):
// verde +30 días, amarillo 14-30, rojo -14 o ya vencido. Mismos tonos que
// semaforo.ts (ROJO/AMARILLO/VERDE_CLARO) para no sumar una paleta nueva.
function diasRestantes(vtoStr: string): number {
  const vto = new Date(vtoStr + "T00:00:00");
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.ceil((vto.getTime() - hoy.getTime()) / 86400000);
}
function vtoSemaforoCls(dias: number): string {
  if (dias < 14) return "bg-red-100 text-red-700";
  if (dias <= 30) return "bg-yellow-100 text-yellow-800";
  return "bg-green-100 text-green-700";
}

type FiltroRapido = "todos" | "vencidos" | "vencen30" | "mis" | "sin_asignar" | "frenados" | "no_corresponde";

const ACCENT_CONTABLE = { dot: "bg-emerald-500", bg: "bg-emerald-50", text: "text-emerald-700" };

type Balance = {
  id: string;
  cliente_id: string;
  anio_fiscal: number;
  fecha_cierre: string;
  responsable_id: string | null;
  responsable2_id: string | null;
  estado: string;
  avance: number;
  envio1: boolean; envio1_fecha: string | null;
  envio2: boolean; envio2_fecha: string | null;
  envio3: boolean; envio3_fecha: string | null;
  info_recibida: boolean; info_recibida_fecha: string | null;
  estado_eecc: string;
  f855_estado: string;
  f899_estado: string;
  f713_estado: string;
  f657_estado: string;
  igj_presentacion: string;
  igj_tasa: string;
  observaciones: string | null;
  no_corresponde_motivo: string | null;
  // Ítem 109: texto del aviso si la fecha de cierre no coincide con la fija del cliente.
  cierre_distinto: string | null;
  // Ítem 91: ya vienen resueltos desde el servidor (regla, prórroga o fecha
  // manual) — este componente no sabe nada de reglas, solo los muestra.
  vtos: VtosBalance;
  clientes: { nombre: string; cuit: string; claves_acceso: ClaveAcceso[] | null } | null;
  responsable: { id: string; nombre: string } | null;
  responsable2: { id: string; nombre: string } | null;
};

const ANIOS = [2026, 2025];

function fmt(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function FormBadge({ estado, options }: {
  estado: string;
  options: { value: string; label: string }[];
}) {
  if (estado === "no_corresponde") return <span className="text-gray-300 text-xs">N/A</span>;
  if (estado === "presentado" || estado === "enviada")
    return <Check size={14} className="text-emerald-500" strokeWidth={2.5} />;
  return <Minus size={14} className="text-gray-300" />;
  void options;
}

export function ContableClient({
  balances: initialBalances,
  equipoContable,
  clientesConServicio,
  anio,
  isAdmin,
  miId,
  puedeEditar,
  equipo,
  equipoModulos,
}: {
  balances: Balance[];
  equipoContable: { id: string; nombre: string }[];
  clientesConServicio: {
    id: string;
    nombre: string;
    cuit: string;
    cierre_ejercicio_mes: number | null;
    cierre_ejercicio_dia: number | null;
  }[];
  anio: number;
  isAdmin: boolean;
  miId: string | null;
  puedeEditar: boolean;
  equipo: EquipoMiembro[];
  equipoModulos: { equipo_id: string; modulo: string }[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [showModal, setShowModal] = useState(false);
  const [showGenerar, setShowGenerar] = useState(false);
  const [filterResp, setFilterResp] = useState("");
  const [filtroRapido, setFiltroRapido] = useState<FiltroRapido>("todos");
  const [mostrarEquipo, setMostrarEquipo] = useState(false);
  const [editandoClienteId, setEditandoClienteId] = useState<string | null>(null);
  const [noCorrespondeDe, setNoCorrespondeDe] = useState<Balance | null>(null);

  const [balancesMap, setBalancesMap] = useState<Map<string, Balance>>(() => {
    const m = new Map<string, Balance>();
    for (const b of initialBalances) m.set(b.id, b);
    return m;
  });

  const balances = useMemo(() => Array.from(balancesMap.values()), [balancesMap]);

  function patch(id: string, updates: Partial<Balance>) {
    setBalancesMap((prev) => {
      const next = new Map(prev);
      const existing = next.get(id);
      if (existing) next.set(id, { ...existing, ...updates });
      return next;
    });
  }

  function update(id: string, updates: Partial<Balance>) {
    // El Estado es automático (ítem 34): si este cambio toca EECC o
    // responsable, se recalcula al toque en la UI para no esperar a que se
    // recargue la página — el server hace exactamente el mismo cálculo y
    // queda como la versión que realmente se guarda.
    const actual = balancesMap.get(id);
    let finalUpdates: Partial<Balance> = updates;
    if (
      actual &&
      !ESTADOS_MANUALES.includes(actual.estado) &&
      ("estado_eecc" in updates || "responsable_id" in updates || "responsable2_id" in updates)
    ) {
      finalUpdates = { ...updates, estado: calcularEstado({ ...actual, ...updates }) };
    }
    patch(id, finalUpdates);
    startTransition(async () => {
      await updateBalance(id, updates as Record<string, unknown>);
    });
  }

  // Frenar/reanudar (ítem 34): única forma manual de tocar el Estado. Al
  // reanudar se manda el centinela "auto" al server, que recalcula desde
  // EECC/responsable — acá se refleja ese mismo cálculo al toque.
  function toggleFrenado(b: Balance) {
    if (b.estado === "frenado") {
      patch(b.id, { estado: calcularEstado(b) });
      startTransition(async () => {
        await updateBalance(b.id, { estado: "auto" });
      });
    } else {
      patch(b.id, { estado: "frenado" });
      startTransition(async () => {
        await updateBalance(b.id, { estado: "frenado" });
      });
    }
  }

  // No corresponde: igual que Frenado, manual y con motivo obligatorio. Al
  // volver se recalcula desde EECC/responsable (centinela "auto").
  function marcarNoCorresponde(b: Balance, motivo: string) {
    patch(b.id, { estado: "no_corresponde", no_corresponde_motivo: motivo });
    startTransition(async () => {
      await updateBalance(b.id, { estado: "no_corresponde", no_corresponde_motivo: motivo });
    });
  }

  function volverACorresponder(b: Balance) {
    patch(b.id, { estado: calcularEstado(b), no_corresponde_motivo: null });
    startTransition(async () => {
      await updateBalance(b.id, { estado: "auto" });
    });
  }

  // Pedido/Recepción de información: fecha y hora igual que F.931/recibos
  // en Sueldos. El servidor es quien realmente la autocompleta (para que
  // quede la hora real del guardado) — acá solo se aproxima para que la
  // casilla muestre algo al toque, sin esperar la respuesta.
  function toggleFecha(id: string, campo: "envio1" | "info_recibida", marcado: boolean) {
    const fechaCampo = campo === "envio1" ? "envio1_fecha" : "info_recibida_fecha";
    patch(id, { [campo]: marcado, [fechaCampo]: marcado ? new Date().toISOString() : null } as Partial<Balance>);
    startTransition(async () => {
      await updateBalance(id, { [campo]: marcado });
    });
  }

  // IDs already in this year
  const yaEnAnio = useMemo(
    () => new Set(balances.map((b) => b.cliente_id)),
    [balances]
  );
  const clientesDisponibles = useMemo(
    () => clientesConServicio.filter((c) => !yaEnAnio.has(c.id)),
    [clientesConServicio, yaEnAnio]
  );

  // Responsables present in this year's data
  const responsablesPresentes = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const b of balances) {
      if (b.responsable?.nombre && !seen.has(b.responsable.nombre)) {
        seen.add(b.responsable.nombre);
        result.push(b.responsable.nombre);
      }
      if (b.responsable2?.nombre && !seen.has(b.responsable2.nombre)) {
        seen.add(b.responsable2.nombre);
        result.push(b.responsable2.nombre);
      }
    }
    return result.sort();
  }, [balances]);

  // Cantidad de balances a cargo de cada persona (cuenta responsable y
  // responsable2 por separado), para el panel de equipo
  const conteosResp = useMemo(() => {
    const m: Record<string, number> = {};
    for (const b of balances) {
      if (!cuentaBalance(b)) continue;
      if (b.responsable?.nombre) m[b.responsable.nombre] = (m[b.responsable.nombre] ?? 0) + 1;
      if (b.responsable2?.nombre) m[b.responsable2.nombre] = (m[b.responsable2.nombre] ?? 0) + 1;
    }
    return m;
  }, [balances]);

  // Por responsable — se aplica antes de los filtros rápidos, así ambos se
  // pueden combinar (ej. "Mi" responsable + "Vencidos").
  const porResp = useMemo(() => {
    if (!filterResp) return balances;
    return balances.filter(
      (b) => b.responsable?.nombre === filterResp || b.responsable2?.nombre === filterResp
    );
  }, [balances, filterResp]);

  // Predicado de cada filtro rápido — "Vencidos"/"Vencen en 30 días" nunca
  // cuentan lo ya finalizado ni lo frenado (no tiene sentido evaluarlos).
  // Los "No corresponde" solo aparecen en su propio filtro.
  function cumpleFiltro(b: Balance, filtro: FiltroRapido): boolean {
    if (filtro === "no_corresponde") return !cuentaBalance(b);
    if (!cuentaBalance(b)) return false;
    switch (filtro) {
      case "todos":
        return true;
      case "vencidos": {
        if (b.estado === "finalizado" || b.estado === "frenado") return false;
        return diasRestantes(b.vtos.balance.fecha) < 0;
      }
      case "vencen30": {
        if (b.estado === "finalizado" || b.estado === "frenado") return false;
        const d = diasRestantes(b.vtos.balance.fecha);
        return d >= 0 && d <= 30;
      }
      case "mis":
        return !!miId && (b.responsable_id === miId || b.responsable2_id === miId);
      case "sin_asignar":
        return b.estado === "sin_asignar";
      case "frenados":
        return b.estado === "frenado";
    }
  }

  // Contador de cada chip — sobre "porResp" (respeta el responsable elegido
  // en el panel de equipo), independiente entre sí (no se van acotando en
  // cascada: cada chip cuenta como si fuera el único filtro aplicado).
  const conteosFiltro = useMemo(
    () => ({
      todos: porResp.length,
      vencidos: porResp.filter((b) => cumpleFiltro(b, "vencidos")).length,
      vencen30: porResp.filter((b) => cumpleFiltro(b, "vencen30")).length,
      mis: porResp.filter((b) => cumpleFiltro(b, "mis")).length,
      sin_asignar: porResp.filter((b) => cumpleFiltro(b, "sin_asignar")).length,
      frenados: porResp.filter((b) => cumpleFiltro(b, "frenados")).length,
      no_corresponde: porResp.filter((b) => cumpleFiltro(b, "no_corresponde")).length,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [porResp, miId]
  );

  // Filas finales: responsable + filtro rápido, ordenadas por fecha de cierre.
  const filas = useMemo(() => {
    const list = porResp.filter((b) => cumpleFiltro(b, filtroRapido));
    return [...list].sort((a, b) => a.fecha_cierre.localeCompare(b.fecha_cierre));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [porResp, filtroRapido, miId]);

  const FORM_OPTIONS_IGJ = [
    { value: "pendiente", label: "Pendiente" },
    { value: "presentado", label: "Presentado" },
    { value: "no_corresponde", label: "N/A" },
  ];
  const FORM_OPTIONS_IGJ_TASA = [
    { value: "pendiente", label: "Pendiente" },
    { value: "enviada", label: "Enviada" },
    { value: "no_corresponde", label: "N/A" },
  ];

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-2 h-6 rounded-full bg-emerald-500" />
            <div>
              <h1 className="text-[17px] font-semibold text-gray-900">Contable — Seguimiento</h1>
              <p className="text-[12px] text-gray-400 mt-0.5">Seguimiento anual por cliente</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <EquipoModuloBoton
              cantidad={equipoContable.length}
              accent={ACCENT_CONTABLE}
              onClick={() => setMostrarEquipo(true)}
            />
            {/* Year selector */}
            <div className="flex gap-0.5 bg-gray-100 p-0.5 rounded-lg">
              {ANIOS.map((a) => (
                <button
                  key={a}
                  onClick={() => router.push(`/contable?anio=${a}`)}
                  className={clsx(
                    "px-3 py-1.5 text-[13px] font-medium rounded-md transition-all",
                    a === anio
                      ? "bg-white text-emerald-700 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  {a}
                </button>
              ))}
            </div>

            {puedeEditar && (
              <button
                onClick={() => setShowGenerar(true)}
                className="px-3 py-2 text-sm font-medium text-emerald-700 bg-white border border-emerald-200 hover:bg-emerald-50 rounded-lg transition-colors"
                title="Crea el balance del año para cada cliente con fecha de cierre fija que todavía no lo tiene"
              >
                Generar balances {anio}
              </button>
            )}

            {puedeEditar && (
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
              >
                <Plus size={14} strokeWidth={2.5} />
                Agregar balance
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filtros rápidos — cada chip es a la vez el contador y el filtro;
          uno solo activo a la vez (no se combinan entre sí, "Mis balances"
          + "Vencidos" sería ambiguo). El responsable sí se combina con
          cualquiera de estos (panel de equipo, botón de la derecha). */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 shrink-0 flex items-center gap-2 flex-wrap">
        {(
          [
            { key: "todos", label: "Todos" },
            { key: "vencidos", label: "Vencidos" },
            { key: "vencen30", label: "Vencen en 30 días" },
            { key: "mis", label: "Mis balances" },
            { key: "sin_asignar", label: "Sin asignar" },
            { key: "frenados", label: "Frenados" },
            { key: "no_corresponde", label: "No corresponde" },
          ] as { key: FiltroRapido; label: string }[]
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFiltroRapido(key)}
            disabled={key === "mis" && !miId}
            className={clsx(
              "flex items-center gap-1.5 text-xs font-medium border rounded-full px-3 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
              filtroRapido === key
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-800"
            )}
          >
            {label}
            <span className={clsx("font-semibold", filtroRapido === key ? "text-emerald-700" : "text-gray-400")}>
              {conteosFiltro[key]}
            </span>
          </button>
        ))}

        <div className="flex-1" />

        <div className="relative">
          <select
            value={filterResp}
            onChange={(e) => setFilterResp(e.target.value)}
            className="appearance-none text-xs text-gray-600 bg-white border border-gray-200 rounded-lg pl-2.5 pr-7 py-1.5 focus:outline-none focus:border-emerald-400 cursor-pointer"
          >
            <option value="">Todos los responsables</option>
            {responsablesPresentes.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Table */}
      {/* min-w-0: sin esto, al ser hijo de un flex-col no se achica por
          debajo del ancho de la tabla (default min-width:auto de flexbox) —
          nunca llega a recortarla ni a activar su propio scroll, y por eso
          tampoco el sticky (header ni columna Cliente) tenía de qué
          "pegarse". */}
      <div className="flex-1 min-h-0 min-w-0 overflow-auto [scrollbar-gutter:stable] pb-2">
        <table className="w-full text-sm whitespace-nowrap table-fixed">
          {/* table-fixed reparte el ancho de columnas según la PRIMERA fila
              del thead — acá esa fila es la franja de colores con colSpan,
              que no define ancho por columna. Sin colgroup, los w-* de la
              segunda fila (Cierre, Vto, Estado, etc.) se ignoran y la tabla
              nunca supera el ancho del contenedor: por eso no aparecía el
              scroll horizontal. */}
          <colgroup>
            <col className="w-56" />
            <col className="w-24" />
            <col className="w-28" />
            <col className="w-28" />
            <col className="w-36" />
            <col className="w-16" />
            <col className="w-36" />
            <col className="w-32" />
            <col className="w-32" />
            <col className="w-40" />
            <col className="w-28" />
            <col className="w-28" />
            <col className="w-14" />
            <col className="w-28" />
            <col className="w-14" />
            <col className="w-14" />
            <col className="w-44" />
            <col className="w-10" />
          </colgroup>
          {/* Cada fila del encabezado es sticky por sí misma (no alcanza con
              sticky solo en el thead): si no, en algunos navegadores la
              segunda fila no queda realmente pegada a la primera y se ve el
              cuerpo de la tabla moviéndose entre ambas al scrollear. h-7 en
              la primera fila + top-7 en la segunda: la segunda arranca
              justo donde termina la primera, sin superposición ni hueco. */}
          <thead>
            {/* Franja de grupos — una por bloque, nombres y color suave para
                orientarse rápido en una tabla ancha. */}
            <tr className="sticky top-0 z-20 h-7 border-b border-gray-200">
              <th className="sticky left-0 z-30 bg-gray-50 px-6 py-1.5" />
              <th colSpan={3} className={clsx(GRUPO.fechas, "text-[10px] font-semibold text-gray-500 uppercase tracking-wide px-3 py-1.5 text-center")}>
                Fechas
              </th>
              <th colSpan={3} className={clsx(GRUPO.estado, "text-[10px] font-semibold text-gray-500 uppercase tracking-wide px-3 py-1.5 text-center")}>
                Estado
              </th>
              <th colSpan={3} className={clsx(GRUPO.etapas, "text-[10px] font-semibold text-gray-500 uppercase tracking-wide px-3 py-1.5 text-center")}>
                Etapas
              </th>
              <th colSpan={4} className={clsx(GRUPO.formularios, "text-[10px] font-semibold text-gray-500 uppercase tracking-wide px-3 py-1.5 text-center")}>
                Formularios
              </th>
              <th colSpan={2} className={clsx(GRUPO.igj, "text-[10px] font-semibold text-gray-500 uppercase tracking-wide px-3 py-1.5 text-center")}>
                IGJ
              </th>
              <th className="bg-gray-50 px-3 py-1.5" />
              <th className="bg-gray-50 px-3 py-1.5" />
            </tr>
            {/* Fondo gris puesto en cada <th>, no solo en el <tr>: con el
                encabezado sticky, el fondo del tr no siempre "viaja" bien
                con las celdas y dejaba ver las filas del cuerpo pasando por
                detrás de esta fila al scrollear. */}
            <tr className="sticky top-7 z-20 border-b border-gray-200">
              {/* Cliente — columna fijada, scrollea horizontal con el resto */}
              <th className="sticky left-0 z-30 bg-gray-50 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-6 py-3 w-56">Cliente</th>
              {/* Fechas */}
              <th className="bg-gray-50 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-3 w-24">Cierre</th>
              <th className="bg-gray-50 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-3 w-24 whitespace-normal leading-tight">Vto balance</th>
              <th className="bg-gray-50 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-3 w-32 whitespace-normal leading-tight">Vto Gcias</th>
              {/* Estado */}
              <th className="bg-gray-50 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-3 w-36">Estado</th>
              <th className="bg-gray-50 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-3 w-16">Avance</th>
              <th className="bg-gray-50 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-3 w-36">Responsable</th>
              {/* Etapas */}
              <th className="bg-gray-50 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-3 w-32 whitespace-normal leading-tight">Pedido de información</th>
              <th className="bg-gray-50 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-3 w-32 whitespace-normal leading-tight">Recepción de información</th>
              <th className="bg-gray-50 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-3 w-40">EECC</th>
              {/* Formularios */}
              <th className="bg-gray-50 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-3 w-24">855</th>
              <th className="bg-gray-50 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-3 w-24">F899</th>
              <th className="bg-gray-50 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-3 w-14">F713</th>
              <th className="bg-gray-50 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-3 w-24">F657</th>
              {/* IGJ */}
              <th className="bg-gray-50 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-3 w-14">IGJ</th>
              <th className="bg-gray-50 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-3 w-14">Tasa</th>
              {/* Obs + acciones */}
              <th className="bg-gray-50 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-3">Obs.</th>
              <th className="bg-gray-50 px-3 py-3 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filas.length === 0 && (
              <tr>
                <td colSpan={18}className="text-center text-gray-400 text-sm py-16">
                  {filterResp || filtroRapido !== "todos"
                    ? "Sin resultados para el filtro aplicado"
                    : `No hay balances cargados para ${anio}`}
                </td>
              </tr>
            )}
            {filas.map((b) => {
              const estadoInfo = ESTADO_BALANCE[b.estado] ?? ESTADO_BALANCE.sin_asignar;
              const eeccInfo = ESTADO_EECC[b.estado_eecc] ?? ESTADO_EECC.pendiente;

              return (
                <tr key={b.id} className="hover:bg-emerald-50/30 transition-colors group">
                  {/* Cliente — columna fijada a la izquierda */}
                  <td className="sticky left-0 z-10 bg-white group-hover:bg-emerald-50/50 px-6 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[13px] font-medium text-gray-800 truncate max-w-[200px]">
                        {b.clientes?.nombre ?? "—"}
                      </p>
                      <FichaClienteBoton
                        clienteId={b.cliente_id}
                        nombre={b.clientes?.nombre ?? "—"}
                        fetchAction={getFichaCliente}
                        puedeEditar={isAdmin}
                        onEditar={() => setEditandoClienteId(b.cliente_id)}
                      />
                    </div>
                  </td>

                  {/* Cierre */}
                  <td className="px-3 py-2.5 text-center">
                    <span className="inline-flex items-center text-[12px] text-gray-600">
                      {fmt(b.fecha_cierre)}
                      {b.cierre_distinto && (
                        <span
                          title={b.cierre_distinto}
                          className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[9px] font-bold text-white bg-amber-500 ml-1 cursor-help"
                        >
                          !
                        </span>
                      )}
                    </span>
                  </td>

                  {/* Vto balance · Vto Gcias — se editan desde
                      Productividad → Configuración (ítem 91) */}
                  <VtoCell vto={b.vtos.balance} />
                  <VtoCell vto={b.vtos.ganancias} />

                  {/* Estado — automático desde EECC/responsable (ítem 34);
                      Frenado es la única excepción manual, se cambia desde
                      el menú ⋯ al final de la fila. */}
                  <td className="px-3 py-2.5 text-center">
                    <span
                      className={clsx("text-[11px] font-medium rounded-full px-2.5 py-1", estadoInfo.cls)}
                      title={
                        b.estado === "no_corresponde"
                          ? `No corresponde: ${b.no_corresponde_motivo ?? "sin motivo"}`
                          : "Se calcula solo según EECC y responsable asignado"
                      }
                    >
                      {estadoInfo.label}
                    </span>
                  </td>

                  {/* Avance — barra fina + %, calculado por etapa (ya no se
                      elige a mano) */}
                  <td
                    className="px-3 py-2.5"
                    title="Se calcula solo según pedido/recepción de información y estado de EECC"
                  >
                    <div className="flex items-center gap-1.5">
                      <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden shrink-0">
                        <div
                          className={clsx("h-full rounded-full", avanceBarCls(calcularAvance(b)))}
                          style={{ width: `${calcularAvance(b)}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-gray-500 tabular-nums">{calcularAvance(b)}%</span>
                    </div>
                  </td>

                  {/* Responsables */}
                  <td className="px-3 py-2.5">
                    {puedeEditar ? (
                      <div className="flex flex-col gap-0.5">
                        <div className="relative">
                          <select
                            value={b.responsable_id ?? ""}
                            onChange={(e) => update(b.id, { responsable_id: e.target.value || null })}
                            className="appearance-none text-[12px] text-gray-700 bg-transparent border-0 focus:outline-none pr-4 cursor-pointer"
                          >
                            <option value="">—</option>
                            <OpcionInactivo id={b.responsable_id} persona={b.responsable} equipo={equipoContable} />
                            {equipoContable.map((e) => (
                              <option key={e.id} value={e.id}>{e.nombre}</option>
                            ))}
                          </select>
                          <ChevronDown size={10} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        </div>
                        {(b.responsable2_id || b.responsable2) && (
                          <div className="relative">
                            <select
                              value={b.responsable2_id ?? ""}
                              onChange={(e) => update(b.id, { responsable2_id: e.target.value || null })}
                              className="appearance-none text-[11px] text-gray-400 bg-transparent border-0 focus:outline-none pr-4 cursor-pointer"
                            >
                              <option value="">—</option>
                              <OpcionInactivo id={b.responsable2_id} persona={b.responsable2} equipo={equipoContable} />
                              {equipoContable.map((e) => (
                                <option key={e.id} value={e.id}>{e.nombre}</option>
                              ))}
                            </select>
                            <ChevronDown size={10} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                          </div>
                        )}
                        {!b.responsable2_id && !b.responsable2 && (
                          <button
                            onClick={() => patch(b.id, { responsable2_id: "" })}
                            className="text-[11px] text-gray-300 hover:text-gray-500 text-left"
                          >
                            + resp. 2
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="text-[12px] text-gray-700">
                        {b.responsable?.nombre ?? "—"}
                        {b.responsable2?.nombre && (
                          <span className="text-gray-400 text-[11px]"> + {b.responsable2.nombre}</span>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Pedido de información (envio1) — degradé hacia rojo si
                      hay demora en la respuesta del cliente */}
                  <FechaCheckCell
                    marcado={b.envio1}
                    fecha={b.envio1_fecha}
                    puedeEditar={puedeEditar}
                    onChange={(marcado) => toggleFecha(b.id, "envio1", marcado)}
                    diasDemora={diasDemoraPedido(b)}
                  />

                  {/* Recepción de información (info_recibida) */}
                  <FechaCheckCell
                    marcado={b.info_recibida}
                    fecha={b.info_recibida_fecha}
                    puedeEditar={puedeEditar}
                    onChange={(marcado) => toggleFecha(b.id, "info_recibida", marcado)}
                  />

                  {/* EECC / Legalización */}
                  <td className="px-3 py-2.5 text-center">
                    {puedeEditar ? (
                      <div className="relative inline-block">
                        <span className={clsx(
                          "flex items-center gap-0.5 text-[11px] font-medium rounded-full pl-2.5 pr-1.5 py-1",
                          eeccInfo.cls
                        )}>
                          {eeccInfo.label}
                          <ChevronDown size={10} className="opacity-50 shrink-0" />
                        </span>
                        <select
                          value={b.estado_eecc}
                          onChange={(e) => update(b.id, { estado_eecc: e.target.value })}
                          className="absolute inset-0 opacity-0 cursor-pointer w-full"
                        >
                          {Object.entries(ESTADO_EECC).map(([v, { label }]) => (
                            <option key={v} value={v}>{label}</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <span className={clsx("text-[11px] font-medium rounded-full px-2.5 py-1", eeccInfo.cls)}>
                        {eeccInfo.label}
                      </span>
                    )}
                  </td>

                  {/* 855 · F899 · F657 — casilla + fecha de vencimiento al
                      lado, con semáforo. Tachado gris si ya está presentado.
                      El 713 no tiene vencimiento propio, va solo con casilla. */}
                  <FormVtoCheckCell estado={b.f855_estado} field="f855_estado" balanceId={b.id}
                    vto={b.vtos.f855} puedeEditar={puedeEditar} onUpdate={update} />
                  <FormVtoCheckCell estado={b.f899_estado} field="f899_estado" balanceId={b.id}
                    vto={b.vtos.f899} puedeEditar={puedeEditar} onUpdate={update} />
                  <FormCheckCell estado={b.f713_estado} field="f713_estado" balanceId={b.id}
                    puedeEditar={puedeEditar} onUpdate={update} />
                  <FormVtoCheckCell estado={b.f657_estado} field="f657_estado" balanceId={b.id}
                    vto={b.vtos.f657} puedeEditar={puedeEditar} onUpdate={update} />

                  {/* IGJ Presentación */}
                  <FormCell estado={b.igj_presentacion} field="igj_presentacion" balanceId={b.id}
                    options={FORM_OPTIONS_IGJ} puedeEditar={puedeEditar} onUpdate={update} />

                  {/* IGJ Tasa */}
                  <FormCell estado={b.igj_tasa} field="igj_tasa" balanceId={b.id}
                    options={FORM_OPTIONS_IGJ_TASA} puedeEditar={puedeEditar} onUpdate={update} />

                  {/* Observaciones */}
                  <td className="px-3 py-2.5 max-w-[180px]">
                    {puedeEditar ? (
                      <input
                        type="text"
                        defaultValue={b.observaciones ?? ""}
                        placeholder="—"
                        onBlur={(e) => update(b.id, { observaciones: e.target.value || null })}
                        className="w-full text-[12px] text-gray-600 border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-emerald-300 rounded px-1 placeholder:text-gray-200 truncate"
                      />
                    ) : (
                      <span className="text-[12px] text-gray-500 truncate block">{b.observaciones ?? "—"}</span>
                    )}
                  </td>

                  {/* Acciones — por ahora, Frenar/Reanudar (ítem 34). */}
                  <td className="px-3 py-2.5 text-center">
                    {puedeEditar && (
                      <AccionesMenu
                        balance={b}
                        onToggleFrenado={() => toggleFrenado(b)}
                        onNoCorresponde={() => setNoCorrespondeDe(b)}
                        onVolverACorresponder={() => volverACorresponder(b)}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showGenerar && <GenerarBalancesModal anio={anio} onClose={() => setShowGenerar(false)} />}
      {showModal && (
        <NuevoBalanceModal
          anio={anio}
          clientesDisponibles={clientesDisponibles}
          equipoContable={equipoContable}
          onClose={() => setShowModal(false)}
        />
      )}
      {mostrarEquipo && (
        <EquipoModuloPanel
          moduloNombre="Contable"
          equipo={equipoContable}
          conteos={conteosResp}
          filterResp={filterResp}
          onSelect={(nombre) => setFilterResp((prev) => (prev === nombre ? "" : nombre))}
          onClose={() => setMostrarEquipo(false)}
          accent={ACCENT_CONTABLE}
        />
      )}
      {noCorrespondeDe && (
        <NoCorrespondeModal
          cliente={noCorrespondeDe.clientes?.nombre ?? "—"}
          anio={noCorrespondeDe.anio_fiscal}
          onClose={() => setNoCorrespondeDe(null)}
          onConfirmar={(motivo) => {
            marcarNoCorresponde(noCorrespondeDe, motivo);
            setNoCorrespondeDe(null);
          }}
        />
      )}
      {editandoClienteId && (
        <EditarClienteModal
          clienteId={editandoClienteId}
          equipo={equipo}
          equipoModulos={equipoModulos}
          onClose={() => setEditandoClienteId(null)}
        />
      )}
    </div>
  );
}

// DD/MM/AA — admite tanto "YYYY-MM-DD" como un timestamp completo
// ("YYYY-MM-DDTHH:mm:ss.sssZ"), toma solo la parte de fecha.
function fmtCorta(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.slice(0, 10).split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

// Casilla que al tildarse/destildarse avisa al padre — la fecha y hora
// real la decide y guarda el servidor (ver updateBalance), acá solo se
// muestra lo que ya está en el balance.
function FechaCheckCell({
  marcado,
  fecha,
  puedeEditar,
  onChange,
  diasDemora,
}: {
  marcado: boolean;
  fecha: string | null;
  puedeEditar: boolean;
  onChange: (marcado: boolean) => void;
  /** Días desde el pedido sin recepción — solo la celda de "Pedido de
   * información" la pasa. 5+ días dispara el degradé hacia rojo. */
  diasDemora?: number | null;
}) {
  const alerta = diasDemora != null && diasDemora >= 5;
  return (
    <td
      className="px-3 py-2.5 text-center"
      style={alerta ? { backgroundColor: colorAlertaDemora(diasDemora!) } : undefined}
      title={alerta ? `Se pidió información hace más de ${diasDemora} días y no se recibió respuesta` : undefined}
    >
      <div className="inline-flex items-center gap-2">
        <input
          type="checkbox"
          checked={marcado}
          disabled={!puedeEditar}
          onChange={(e) => onChange(e.target.checked)}
          className="w-3.5 h-3.5 accent-emerald-600 cursor-pointer"
        />
        <span className="w-[52px] text-left text-[11px] text-gray-500 tabular-nums">
          {marcado ? fmtCorta(fecha) : ""}
        </span>
      </div>
    </td>
  );
}

// Formularios binarios (855, F899, F713): casilla tildada = "presentado",
// destildada = "pendiente". Mismos valores que ya guarda la base.
function FormCheckCell({
  estado,
  field,
  balanceId,
  puedeEditar,
  onUpdate,
}: {
  estado: string;
  field: string;
  balanceId: string;
  puedeEditar: boolean;
  onUpdate: (id: string, updates: Partial<Balance>) => void;
}) {
  return (
    <td className="px-3 py-2.5 text-center">
      <input
        type="checkbox"
        checked={estado === "presentado"}
        disabled={!puedeEditar}
        onChange={(e) =>
          onUpdate(balanceId, { [field]: e.target.checked ? "presentado" : "pendiente" } as Partial<Balance>)
        }
        title={estado === "presentado" ? "Presentado" : "No presentado"}
        className="w-3.5 h-3.5 accent-emerald-600 cursor-pointer"
      />
    </td>
  );
}

// Formulario con vencimiento propio (855, 899, 657): casilla + fecha al
// lado, coloreada por semáforo (verde +30 días, amarillo 14-30, rojo -14 o
// vencido). Tachado y gris si ya está presentado — ahí el semáforo no
// importa más.
function FormVtoCheckCell({
  estado,
  field,
  balanceId,
  vto,
  puedeEditar,
  onUpdate,
}: {
  estado: string;
  field: string;
  balanceId: string;
  vto: Vto;
  puedeEditar: boolean;
  onUpdate: (id: string, updates: Partial<Balance>) => void;
}) {
  const presentado = estado === "presentado";
  return (
    <td className="px-3 py-2.5">
      <div className="inline-flex items-center gap-1.5">
        <input
          type="checkbox"
          checked={presentado}
          disabled={!puedeEditar}
          onChange={(e) =>
            onUpdate(balanceId, { [field]: e.target.checked ? "presentado" : "pendiente" } as Partial<Balance>)
          }
          title={presentado ? "Presentado" : "No presentado"}
          className="w-3.5 h-3.5 accent-emerald-600 cursor-pointer shrink-0"
        />
        <span
          className={clsx(
            "text-[11px] rounded px-1.5 py-0.5 tabular-nums",
            presentado ? "text-gray-400 line-through bg-transparent" : vtoSemaforoCls(diasRestantes(vto.fecha))
          )}
        >
          {fmt(vto.fecha)}
        </span>
        <MarcaVto vto={vto} />
      </div>
    </td>
  );
}

// Ítem 118: si el responsable de un balance ya no es del equipo contable
// activo (dado de baja o sacado del área), se sigue viendo su nombre en ese
// balance — antes aparecía "—" — pero deshabilitado: no se puede elegir para
// otro balance ni volver a elegir una vez cambiado.
function OpcionInactivo({
  id,
  persona,
  equipo,
}: {
  id: string | null;
  persona: { id: string; nombre: string } | null;
  equipo: { id: string }[];
}) {
  if (!id || equipo.some((e) => e.id === id)) return null;
  return (
    <option value={id} disabled>
      {persona?.nombre ?? "Responsable"} (inactivo)
    </option>
  );
}

// Vto balance / Ganancias: solo lectura, con la marca P/M si no sale de la
// regla general.
function VtoCell({ vto }: { vto: Vto }) {
  return (
    <td className="px-3 py-2.5 text-center">
      <span className="inline-flex items-center text-[12px] text-gray-500 tabular-nums">
        {fmt(vto.fecha)}
        <MarcaVto vto={vto} />
      </span>
    </td>
  );
}

// Menú de acciones de la fila (⋯) — hoy solo Frenar/Reanudar (ítem 34), deja
// lugar para sumar más sin volver a amontonar botones en la celda de Estado.
function AccionesMenu({
  balance,
  onToggleFrenado,
  onNoCorresponde,
  onVolverACorresponder,
}: {
  balance: Balance;
  onToggleFrenado: () => void;
  onNoCorresponde: () => void;
  onVolverACorresponder: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const frenado = balance.estado === "frenado";
  const noCorresponde = balance.estado === "no_corresponde";

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="text-gray-300 hover:text-gray-600 p-1 rounded transition-colors"
        title="Más acciones"
      >
        <MoreHorizontal size={16} />
      </button>

      {abierto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAbierto(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
            {noCorresponde ? (
              <button
                type="button"
                onClick={() => {
                  onVolverACorresponder();
                  setAbierto(false);
                }}
                className="w-full text-left text-[12px] px-3 py-1.5 hover:bg-gray-50 text-emerald-600"
              >
                Vuelve a corresponder
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onToggleFrenado();
                    setAbierto(false);
                  }}
                  className={clsx(
                    "w-full text-left text-[12px] px-3 py-1.5 hover:bg-gray-50",
                    frenado ? "text-emerald-600" : "text-red-600"
                  )}
                >
                  {frenado ? "Reanudar" : "Frenar"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onNoCorresponde();
                    setAbierto(false);
                  }}
                  className="w-full text-left text-[12px] px-3 py-1.5 hover:bg-gray-50 text-gray-600"
                >
                  No corresponde…
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Extracted to avoid duplication
function FormCell({
  estado,
  field,
  balanceId,
  options,
  puedeEditar,
  onUpdate,
}: {
  estado: string;
  field: string;
  balanceId: string;
  options: { value: string; label: string }[];
  puedeEditar: boolean;
  onUpdate: (id: string, updates: Partial<Balance>) => void;
}) {
  if (!puedeEditar) {
    return (
      <td className="px-3 py-2.5 text-center">
        <FormBadge estado={estado} options={options} />
      </td>
    );
  }
  return (
    <td className="px-3 py-2.5 text-center">
      <div className="relative inline-flex items-center justify-center">
        <select
          value={estado}
          onChange={(e) => onUpdate(balanceId, { [field]: e.target.value } as Partial<Balance>)}
          className="absolute inset-0 opacity-0 cursor-pointer w-full"
        >
          {options.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <FormBadge estado={estado} options={options} />
      </div>
    </td>
  );
}

// Motivo obligatorio para "No corresponde": uno de los habituales u "Otro"
// con texto libre.
function NoCorrespondeModal({
  cliente,
  anio,
  onClose,
  onConfirmar,
}: {
  cliente: string;
  anio: number;
  onClose: () => void;
  onConfirmar: (motivo: string) => void;
}) {
  const [opcion, setOpcion] = useState<string>(MOTIVOS_NO_CORRESPONDE[0]);
  const [otro, setOtro] = useState("");
  const backdrop = useBackdropClose(onClose);
  const motivo = opcion === "otro" ? otro.trim() : opcion;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...backdrop}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-[15px] font-semibold text-gray-900">No corresponde</h2>
          <p className="text-[12px] text-gray-400 mt-0.5">{cliente} — {anio}</p>
        </div>
        <div className="px-6 py-5 space-y-3">
          <p className="text-[12px] text-gray-500">
            El balance deja de contar en totales, pendientes, vencidos, objetivos y productividad. Se sigue viendo con el
            filtro &quot;No corresponde&quot; y se puede volver atrás desde el menú ⋯.
          </p>
          <div className="space-y-1.5">
            {[...MOTIVOS_NO_CORRESPONDE, "otro"].map((m) => (
              <label key={m} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="radio" checked={opcion === m} onChange={() => setOpcion(m)} className="accent-emerald-600" />
                {m === "otro" ? "Otro motivo" : m}
              </label>
            ))}
          </div>
          {opcion === "otro" && (
            <input
              autoFocus
              value={otro}
              onChange={(e) => setOtro(e.target.value)}
              placeholder="Escribí el motivo"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
            />
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700">
              Cancelar
            </button>
            <button
              type="button"
              disabled={!motivo}
              onClick={() => onConfirmar(motivo)}
              className="px-4 py-2 text-sm font-semibold text-white bg-gray-700 hover:bg-gray-800 rounded-lg disabled:opacity-40"
            >
              Marcar como no corresponde
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
