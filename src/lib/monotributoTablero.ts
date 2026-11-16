// Dashboard de Monotributo: un solo cálculo para la pantalla y el Excel.
// Solo clientes con Monotributo activo. Administrativo/Cobranzas nunca cuentan
// como responsables: sus clientes quedan como "Sin responsable".

import { createAdminClient } from "@/lib/supabase/admin";
import { resolverResponsablesVigentes } from "@/lib/asignacionesServicio";
import {
  CAMPO_REVISION_LABEL,
  DATOS_VACIOS,
  ESTADOS_MES,
  FORMA_PAGO_LABEL,
  MEDIO_LABEL,
  hoyArgentina,
  puedeSerResponsable,
  vencimientoCuota,
  type CampoRevision,
  type DatosMonotributoCliente,
  type EstadoMes,
  type FormaPago,
  type Gravedad,
  type Medio,
} from "@/lib/monotributo";
import { traerPaginado } from "@/lib/monotributoServer";

export const SIN_RESPONSABLE = "sin";

/** Formas de pago que no requieren envío mensual de VEP/QR. */
export const FORMAS_SIN_ENVIO: FormaPago[] = ["debito_automatico", "tarjeta_credito", "paga_por_su_cuenta"];

const TIPO_LABEL: Record<string, string> = { monotributista: "Monotributista", empresa: "Empresa", inscripto: "Inscripto" };
const INTIMACION_LABEL: Record<string, string> = { no: "No", fijarse: "Fijarse", avisado: "Avisado", si: "Sí", pago: "Pagó" };
const DEUDA_LABEL: Record<string, string> = { si: "Sí", no: "No", sin_verificar: "Sin verificar" };

export interface Conteo { label: string; n: number }

export interface FilaClienteTablero {
  cliente_id: string;
  nombre: string;
  cuit: string;
  responsable: string;
  estado: EstadoMes;
  forma_pago: string;
  medio: string;
  envio: string;
  destinatario: string;
  categoria: string;
  tipo: string;
  grupo: string;
  deuda: string;
  deuda_monto: number | null;
  deuda_avisada: boolean;
  intimacion: string;
  marcas_rojo: number;
  marcas_amarillo: number;
  marcas_detalle: string;
}

export interface TableroMonotributo {
  anio: number;
  mes: number;
  vencimiento: string;
  diasAlVencimiento: number;
  responsables: { id: string; nombre: string }[];
  respFiltro: string | null;
  respFiltroNombre: string | null;
  total: number;
  estados: Record<EstadoMes, number>;
  sinRegistro: number;
  porResponsable: { nombre: string; total: number; estados: Record<EstadoMes, number> }[];
  recategorizacion: { realizadas: number; pendientes: number };
  cartera: {
    formaPago: Conteo[];
    medio: Conteo[];
    envio: Conteo[];
    categoria: Conteo[];
    tipo: Conteo[];
    grupos: Conteo[];
    sinGrupo: number;
  };
  deuda: {
    conDeuda: number;
    importeTotal: number;
    conImporte: number;
    sinDeuda: number;
    sinVerificar: number;
    avisados: number;
    noAvisados: number;
    intimaciones: Conteo[];
  };
  automatizacion: {
    sinEnvio: number;
    pctSinEnvio: number;
    enviosVep: number;
    avisos: number;
    destinatarios: number;
    destinatariosCompartidos: Conteo[];
  };
  revisiones: { total: number; rojo: number; amarillo: number; porResponsable: { nombre: string; rojo: number; amarillo: number }[] };
  clientes: FilaClienteTablero[];
}

function estadosVacios(): Record<EstadoMes, number> {
  return Object.fromEntries(ESTADOS_MES.map((e) => [e, 0])) as Record<EstadoMes, number>;
}

function contar(valores: string[], orden?: string[]): Conteo[] {
  const m = new Map<string, number>();
  for (const v of valores) m.set(v, (m.get(v) ?? 0) + 1);
  const lista = Array.from(m.entries()).map(([label, n]) => ({ label, n }));
  if (orden) return lista.sort((a, b) => (orden.indexOf(a.label) + 1 || 999) - (orden.indexOf(b.label) + 1 || 999));
  return lista.sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
}

function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(hasta + "T00:00:00Z") - Date.parse(desde + "T00:00:00Z")) / 86_400_000);
}

/** Clave del destinatario real de los envíos: mismos mails / mismo teléfono = mismo destinatario. */
function claveDestinatario(d: DatosMonotributoCliente, clienteId: string): { clave: string; label: string } {
  if (d.medio === "mail" && d.mails.length) {
    const mails = [...d.mails].map((m) => m.toLowerCase()).sort();
    return { clave: "m:" + mails.join(","), label: mails.join(" ; ") };
  }
  const tel = (d.whatsapp ?? "").replace(/\D/g, "");
  if (d.medio === "whatsapp" && tel) return { clave: "w:" + tel, label: d.whatsapp! };
  if (d.destinatario) return { clave: "d:" + d.destinatario.trim().toUpperCase(), label: d.destinatario };
  return { clave: "c:" + clienteId, label: "—" };
}

export async function armarTableroMonotributo(anio: number, mes: number, respFiltro: string | null): Promise<TableroMonotributo> {
  const admin = createAdminClient();

  type Serv = { cliente_id: string; responsable_id: string | null; clientes: { nombre: string; cuit: string; tipo_contribuyente: string | null } | null };
  type Tarea = {
    cliente_id: string; cuota_estado: EstadoMes; recategorizacion: string; categoria: string | null;
    deuda_estado: string; deuda_monto: number | null; deuda_aviso: boolean; deuda_resuelta: boolean; intimacion_estado: string | null;
  };

  const [vigentes, servicios, fichas, tareas, revisiones, personas] = await Promise.all([
    resolverResponsablesVigentes("monotributo", "general", anio, mes),
    traerPaginado<Serv>((d, h) =>
      admin.from("servicios_cliente").select("cliente_id, responsable_id, clientes(nombre, cuit, tipo_contribuyente)")
        .eq("servicio", "monotributo").eq("subtipo", "general").eq("estado", true).order("id").range(d, h)
    ),
    traerPaginado<DatosMonotributoCliente & { cliente_id: string }>((d, h) =>
      admin.from("monotributo_clientes").select("*").order("id").range(d, h)
    ),
    traerPaginado<Tarea>((d, h) =>
      admin.from("monotributo_tareas")
        .select("cliente_id, cuota_estado, recategorizacion, categoria, deuda_estado, deuda_monto, deuda_aviso, deuda_resuelta, intimacion_estado")
        .eq("anio", anio).eq("mes", mes).order("id").range(d, h)
    ),
    traerPaginado<{ cliente_id: string; gravedad: Gravedad; campo: CampoRevision }>((d, h) =>
      admin.from("monotributo_revisiones").select("cliente_id, gravedad, campo").eq("estado", "pendiente").order("id").range(d, h)
    ),
    traerPaginado<{ id: string; nombre: string; rol: string }>((d, h) =>
      admin.from("liquidadoras").select("id, nombre, rol").order("id").range(d, h)
    ),
  ]);

  const persona = new Map(personas.map((p) => [p.id, p]));
  const fichaPor = new Map(fichas.map((f) => [f.cliente_id, { ...DATOS_VACIOS, ...f, mails: f.mails ?? [] }]));
  const tareaPor = new Map(tareas.map((t) => [t.cliente_id, t]));
  const revPor = new Map<string, { rojo: number; amarillo: number; campos: string[] }>();
  for (const r of revisiones) {
    const x = revPor.get(r.cliente_id) ?? { rojo: 0, amarillo: 0, campos: [] };
    x[r.gravedad]++;
    x.campos.push(CAMPO_REVISION_LABEL[r.campo]);
    revPor.set(r.cliente_id, x);
  }

  // Responsable vigente del período (igual criterio que Seguimiento), sin administrativos.
  const respDe = (s: Serv): string | null => {
    const id = vigentes.get(s.cliente_id)?.id ?? s.responsable_id;
    return id && puedeSerResponsable(persona.get(id)?.rol) ? id : null;
  };

  const todos = servicios.map((s) => ({ s, resp: respDe(s) }));
  const responsables = Array.from(new Set(todos.map((x) => x.resp).filter((x): x is string => !!x)))
    .map((id) => ({ id, nombre: persona.get(id)?.nombre ?? "—" }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  const filtrados = todos.filter(({ resp }) =>
    !respFiltro ? true : respFiltro === SIN_RESPONSABLE ? !resp : resp === respFiltro
  );

  const estados = estadosVacios();
  let sinRegistro = 0;
  const porResp = new Map<string, { nombre: string; total: number; estados: Record<EstadoMes, number> }>();
  let recatRealizadas = 0, recatPendientes = 0;
  const clientes: FilaClienteTablero[] = [];
  const formas: string[] = [], medios: string[] = [], envios: string[] = [], categorias: string[] = [], tipos: string[] = [], grupos: string[] = [];
  let sinGrupo = 0;
  const deuda = { conDeuda: 0, importeTotal: 0, conImporte: 0, sinDeuda: 0, sinVerificar: 0, avisados: 0, noAvisados: 0 };
  const intimaciones: string[] = [];
  let sinEnvio = 0, enviosVep = 0, avisos = 0;
  const destinatarios = new Map<string, { label: string; n: number }>();
  const revResp = new Map<string, { nombre: string; rojo: number; amarillo: number }>();
  let revRojo = 0, revAmarillo = 0;

  for (const { s, resp } of filtrados) {
    const ficha = fichaPor.get(s.cliente_id) ?? { ...DATOS_VACIOS };
    const t = tareaPor.get(s.cliente_id);
    const estado: EstadoMes = t?.cuota_estado ?? "pendiente";
    if (!t) sinRegistro++;
    estados[estado]++;

    const respNombre = resp ? (persona.get(resp)?.nombre ?? "—") : "Sin responsable";
    const keyResp = resp ?? SIN_RESPONSABLE;
    if (!porResp.has(keyResp)) porResp.set(keyResp, { nombre: respNombre, total: 0, estados: estadosVacios() });
    const pr = porResp.get(keyResp)!;
    pr.total++;
    pr.estados[estado]++;

    if (t?.recategorizacion === "realizada") recatRealizadas++;
    else if (!t || t.recategorizacion === "pendiente") recatPendientes++;

    const formaLabel = ficha.forma_pago ? FORMA_PAGO_LABEL[ficha.forma_pago] : "Sin forma de pago";
    const medioLabel = ficha.medio ? MEDIO_LABEL[ficha.medio as Medio] : "Sin medio";
    const envioLabel = ficha.envia_vep && ficha.avisa ? "Ambos (avisar y enviar)" : ficha.envia_vep ? "Enviar" : ficha.avisa ? "Avisar" : "Ninguno";
    const categoria = t?.categoria ?? "Sin categoría";
    const tipo = TIPO_LABEL[s.clientes?.tipo_contribuyente ?? ""] ?? "Sin tipo";
    formas.push(formaLabel); medios.push(medioLabel); envios.push(envioLabel); categorias.push(categoria); tipos.push(tipo);
    if (ficha.empresa_grupo) grupos.push(ficha.empresa_grupo.trim().toUpperCase()); else sinGrupo++;

    // Una deuda marcada resuelta ya no cuenta como deuda.
    const deudaEstado = t?.deuda_estado === "si" && t.deuda_resuelta ? "no" : (t?.deuda_estado ?? "sin_verificar");
    if (deudaEstado === "si") {
      deuda.conDeuda++;
      if (t?.deuda_monto) { deuda.importeTotal += Number(t.deuda_monto); deuda.conImporte++; }
      if (t?.deuda_aviso) deuda.avisados++; else deuda.noAvisados++;
    } else if (deudaEstado === "no") deuda.sinDeuda++;
    else deuda.sinVerificar++;
    intimaciones.push(INTIMACION_LABEL[t?.intimacion_estado ?? ""] ?? "Sin dato");

    if (ficha.forma_pago && FORMAS_SIN_ENVIO.includes(ficha.forma_pago)) sinEnvio++;
    if (ficha.envia_vep) enviosVep++;
    if (ficha.avisa) avisos++;
    const dest = claveDestinatario(ficha, s.cliente_id);
    if (ficha.envia_vep || ficha.avisa) {
      const d = destinatarios.get(dest.clave) ?? { label: dest.label, n: 0 };
      d.n++;
      destinatarios.set(dest.clave, d);
    }

    const rev = revPor.get(s.cliente_id);
    if (rev) {
      revRojo += rev.rojo; revAmarillo += rev.amarillo;
      const rr = revResp.get(keyResp) ?? { nombre: respNombre, rojo: 0, amarillo: 0 };
      rr.rojo += rev.rojo; rr.amarillo += rev.amarillo;
      revResp.set(keyResp, rr);
    }

    clientes.push({
      cliente_id: s.cliente_id,
      nombre: s.clientes?.nombre ?? "—",
      cuit: s.clientes?.cuit ?? "",
      responsable: respNombre,
      estado,
      forma_pago: formaLabel,
      medio: medioLabel,
      envio: envioLabel,
      destinatario: [ficha.destinatario, dest.label !== "—" ? dest.label : null].filter(Boolean).join(" · "),
      categoria,
      tipo,
      grupo: ficha.empresa_grupo ?? "",
      deuda: DEUDA_LABEL[deudaEstado] ?? deudaEstado,
      deuda_monto: t?.deuda_monto ?? null,
      deuda_avisada: !!t?.deuda_aviso,
      intimacion: INTIMACION_LABEL[t?.intimacion_estado ?? ""] ?? "",
      marcas_rojo: rev?.rojo ?? 0,
      marcas_amarillo: rev?.amarillo ?? 0,
      marcas_detalle: rev ? Array.from(new Set(rev.campos)).join(", ") : "",
    });
  }

  const total = filtrados.length;
  const vencimiento = vencimientoCuota(anio, mes);
  const todasLasFormas = [...Object.values(FORMA_PAGO_LABEL), "Sin forma de pago"];
  const categoriasOrden = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "Sin categoría"];

  return {
    anio,
    mes,
    vencimiento,
    diasAlVencimiento: diasEntre(hoyArgentina(), vencimiento),
    responsables,
    respFiltro,
    respFiltroNombre: !respFiltro ? null : respFiltro === SIN_RESPONSABLE ? "Sin responsable" : (persona.get(respFiltro)?.nombre ?? null),
    total,
    estados,
    sinRegistro,
    porResponsable: Array.from(porResp.values()).sort((a, b) =>
      a.nombre === "Sin responsable" ? 1 : b.nombre === "Sin responsable" ? -1 : b.total - a.total
    ),
    recategorizacion: { realizadas: recatRealizadas, pendientes: recatPendientes },
    cartera: {
      formaPago: contar(formas, todasLasFormas),
      medio: contar(medios, ["Mail", "WhatsApp", "Sin medio"]),
      envio: contar(envios, ["Enviar", "Avisar", "Ambos (avisar y enviar)", "Ninguno"]),
      categoria: contar(categorias, categoriasOrden),
      tipo: contar(tipos),
      grupos: contar(grupos).slice(0, 12),
      sinGrupo,
    },
    deuda: { ...deuda, intimaciones: contar(intimaciones, ["Sí", "Fijarse", "Avisado", "Pagó", "No", "Sin dato"]) },
    automatizacion: {
      sinEnvio,
      pctSinEnvio: total ? Math.round((sinEnvio / total) * 100) : 0,
      enviosVep,
      avisos,
      destinatarios: destinatarios.size,
      destinatariosCompartidos: Array.from(destinatarios.values())
        .filter((d) => d.n > 1)
        .sort((a, b) => b.n - a.n)
        .slice(0, 8)
        .map((d) => ({ label: d.label, n: d.n })),
    },
    revisiones: {
      total: revRojo + revAmarillo,
      rojo: revRojo,
      amarillo: revAmarillo,
      porResponsable: Array.from(revResp.values()).sort((a, b) => b.rojo + b.amarillo - (a.rojo + a.amarillo)),
    },
    clientes: clientes.sort((a, b) => a.nombre.localeCompare(b.nombre)),
  };
}

