// Alertas internas de Monotributo (etapa 7). Solo adentro de BOS: no se manda
// nada a clientes ni se usa Resend. Se calculan en el momento a partir del
// estado del mes y la ficha, así que se cierran solas cuando el estado cambia.
// Las que no tienen un estado que las cierre (intimación) se cierran con
// "Resuelta" (tabla monotributo_alertas_resueltas).

import { createAdminClient } from "@/lib/supabase/admin";
import { resolverResponsablesVigentes } from "@/lib/asignacionesServicio";
import {
  DATOS_VACIOS,
  ESTADO_MES_LABEL,
  hoyArgentina,
  puedeSerResponsable,
  vencimientoCuota,
  type DatosMonotributoCliente,
  type EstadoMes,
  type Gravedad,
} from "@/lib/monotributo";
import { traerPaginado } from "@/lib/monotributoServer";
import { TIPOS_ALERTA, TIPOS_CON_RESUELTA, type Alerta, type TipoAlerta } from "@/lib/monotributoAlertasTipos";

export * from "@/lib/monotributoAlertasTipos";

const CERRADO_ENVIO: EstadoMes[] = ["enviado", "pagado", "no_pago"];
const CERRADO_AVISO: EstadoMes[] = ["avisado", "enviado", "pagado", "no_pago"];
const CERRADO_PAGO: EstadoMes[] = ["pagado", "no_pago"];

function fmt(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export async function calcularAlertasMonotributo(anio: number, mes: number): Promise<{
  alertas: Alerta[];
  vencimiento: string;
  vencido: boolean;
  resueltasDisponible: boolean;
}> {
  const admin = createAdminClient();
  type Serv = { cliente_id: string; responsable_id: string | null; clientes: { nombre: string } | null };
  type Tarea = { cliente_id: string; cuota_estado: EstadoMes; deuda_estado: string; deuda_aviso: boolean; intimacion_estado: string | null };

  const [vigentes, servicios, fichas, tareas, personas, resueltasRes] = await Promise.all([
    resolverResponsablesVigentes("monotributo", "general", anio, mes),
    traerPaginado<Serv>((d, h) =>
      admin.from("servicios_cliente").select("cliente_id, responsable_id, clientes(nombre)")
        .eq("servicio", "monotributo").eq("subtipo", "general").eq("estado", true).order("id").range(d, h)
    ),
    traerPaginado<DatosMonotributoCliente & { cliente_id: string }>((d, h) =>
      admin.from("monotributo_clientes").select("*").order("id").range(d, h)
    ),
    traerPaginado<Tarea>((d, h) =>
      admin.from("monotributo_tareas").select("cliente_id, cuota_estado, deuda_estado, deuda_aviso, intimacion_estado")
        .eq("anio", anio).eq("mes", mes).order("id").range(d, h)
    ),
    traerPaginado<{ id: string; nombre: string; rol: string }>((d, h) =>
      admin.from("liquidadoras").select("id, nombre, rol").order("id").range(d, h)
    ),
    // Si la tabla todavía no existe (SQL de la etapa 7 sin correr), las alertas se muestran igual.
    traerPaginado<{ cliente_id: string; tipo: string; valor: string | null }>((d, h) =>
      admin.from("monotributo_alertas_resueltas").select("cliente_id, tipo, valor")
        .eq("anio", anio).eq("mes", mes).order("id").range(d, h)
    ).then((filas) => ({ filas, ok: true }), () => ({ filas: [], ok: false })),
  ]);

  const persona = new Map(personas.map((p) => [p.id, p]));
  const fichaPor = new Map(fichas.map((f) => [f.cliente_id, { ...DATOS_VACIOS, ...f, mails: f.mails ?? [] }]));
  const tareaPor = new Map(tareas.map((t) => [t.cliente_id, t]));
  const resuelta = new Set(resueltasRes.filas.map((r) => `${r.cliente_id}|${r.tipo}|${r.valor ?? ""}`));

  const vencimiento = vencimientoCuota(anio, mes);
  const vencido = hoyArgentina() > vencimiento;
  const alertas: Alerta[] = [];

  for (const s of servicios) {
    const idVigente = vigentes.get(s.cliente_id)?.id ?? s.responsable_id;
    const respId = idVigente && puedeSerResponsable(persona.get(idVigente)?.rol) ? idVigente : null;
    const base = {
      cliente_id: s.cliente_id,
      cliente: s.clientes?.nombre ?? "—",
      responsable_id: respId,
      responsable: respId ? (persona.get(respId)?.nombre ?? "—") : "Sin responsable",
    };
    const agregar = (tipo: TipoAlerta, gravedad: Gravedad, detalle: string, valor: string | null = null) => {
      if (TIPOS_CON_RESUELTA.includes(tipo) && resuelta.has(`${s.cliente_id}|${tipo}|${valor ?? ""}`)) return;
      alertas.push({ ...base, clave: `${s.cliente_id}|${tipo}`, tipo, gravedad, detalle, valor });
    };

    const ficha = fichaPor.get(s.cliente_id) ?? { ...DATOS_VACIOS };
    const t = tareaPor.get(s.cliente_id);
    const estado: EstadoMes = t?.cuota_estado ?? "pendiente";
    const estadoTxt = t ? ESTADO_MES_LABEL[estado] : "sin registro del mes";

    if (!respId) agregar("sin_responsable", "rojo", "El cliente no tiene responsable: le llega al administrador.");

    if (vencido && estado === "enviado") {
      agregar("verificar_pago", "amarillo", `VEP enviado y sin Pagado; venció el ${fmt(vencimiento)}. Nunca pasa solo a "No pagó".`);
    }
    if (ficha.envia_vep && !CERRADO_ENVIO.includes(estado)) {
      agregar("sin_enviar", vencido ? "rojo" : "amarillo",
        vencido ? `Venció el ${fmt(vencimiento)} sin VEP enviado (estado: ${estadoTxt}).` : `Vence el ${fmt(vencimiento)}; estado: ${estadoTxt}.`);
    }
    if (ficha.avisa && !CERRADO_AVISO.includes(estado)) {
      agregar("sin_avisar", vencido ? "rojo" : "amarillo", `Cliente de AVISAR sin marcar Avisado (estado: ${estadoTxt}).`);
    }
    if (t?.deuda_estado === "si" && !t.deuda_aviso) {
      agregar("deuda_sin_avisar", "rojo", "Tiene deuda y no figura avisada al cliente.");
    }
    if (t?.intimacion_estado === "si" || t?.intimacion_estado === "fijarse") {
      agregar("intimacion", t.intimacion_estado === "si" ? "rojo" : "amarillo",
        t.intimacion_estado === "si" ? "Intimación: Sí." : "Intimación: Fijarse.", t.intimacion_estado);
    }
    if (vencido && (ficha.forma_pago === "debito_automatico" || ficha.forma_pago === "tarjeta_credito") && !CERRADO_PAGO.includes(estado)) {
      agregar("debito_sin_verificar", "amarillo",
        `${ficha.forma_pago === "debito_automatico" ? "Débito automático" : "Tarjeta"}: verificar que el débito pasó y marcar Pagado.`);
    }
  }

  alertas.sort((a, b) =>
    (a.gravedad === b.gravedad ? 0 : a.gravedad === "rojo" ? -1 : 1) ||
    TIPOS_ALERTA.indexOf(a.tipo) - TIPOS_ALERTA.indexOf(b.tipo) ||
    a.cliente.localeCompare(b.cliente)
  );
  return { alertas, vencimiento, vencido, resueltasDisponible: resueltasRes.ok };
}
