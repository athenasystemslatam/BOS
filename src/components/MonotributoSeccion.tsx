"use client";

import { useEffect, useState, useTransition } from "react";
import clsx from "clsx";
import { Loader2 } from "lucide-react";
import {
  obtenerFichaMonotributo,
  guardarFichaMonotributo,
  type CambiosMonotributo,
  type FichaMonotributo,
} from "@/app/(dashboard)/monotributo/fichaActions";
import { confirmarRevisiones, reabrirRevision } from "@/app/(dashboard)/monotributo/revisionesActions";
import { obtenerHistorialCliente, revertirCambio, type EntradaHistorialVista } from "@/app/(dashboard)/monotributo/historialActions";
import { useDeshacer } from "@/components/DeshacerAviso";
import { upsertMonotributoTarea, type CambiosTarea } from "@/app/(dashboard)/monotributo/actions";
import { DEUDA_LABEL, DeudaMonotributoModal } from "@/components/DeudaMonotributoModal";
import { MESES_NOMBRES } from "@/lib/vencimientos";
import { crearAsignacionServicio } from "@/lib/asignacionesServicio";

const CATEGORIAS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"];
import {
  CAMPO_REVISION_LABEL,
  ESTADO_MES_LABEL,
  FORMAS_PAGO,
  FORMA_PAGO_LABEL,
  MEDIOS,
  MEDIO_LABEL,
  fmtFechaHoraAR,
  parsearMails,
  type CampoRevision,
  type Gravedad,
} from "@/lib/monotributo";

const MARCA: Record<Gravedad, string> = {
  rojo: "bg-red-50 border-red-300",
  amarillo: "bg-amber-50 border-amber-300",
};

/** Sección "Monotributo" de la ficha del cliente: datos fijos del módulo
 * (no dependen del mes) y sus marcas de revisión. Se carga sola al abrir la
 * ficha y no aparece si el cliente nunca tuvo el servicio. */
export function MonotributoSeccion({
  clienteId,
  nombreCliente,
  onInfo,
}: {
  clienteId: string;
  nombreCliente?: string;
  onInfo?: (info: { soloMonotributo: boolean; puedeEditar: boolean }) => void;
}) {
  const [ficha, setFicha] = useState<FichaMonotributo | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [verHistorial, setVerHistorial] = useState(false);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const [verDeuda, setVerDeuda] = useState(false);
  const [guardando, startGuardar] = useTransition();
  const { ofrecer, aviso: avisoDeshacer } = useDeshacer();

  useEffect(() => {
    obtenerFichaMonotributo(clienteId).then((f) => {
      setFicha(f);
      if (f?.mostrar) onInfo?.({ soloMonotributo: f.soloMonotributo, puedeEditar: f.puedeEditar });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  if (ficha === undefined) {
    return (
      <p className="text-[12px] text-gray-400 flex items-center gap-1.5">
        <Loader2 size={12} className="animate-spin" /> Cargando Monotributo…
      </p>
    );
  }
  if (!ficha || !ficha.mostrar) return null;

  const { datos, puedeEditar, revisiones } = ficha;
  const pendientes = revisiones.filter((r) => r.estado === "pendiente");
  const resueltas = revisiones.filter((r) => r.estado === "resuelta");
  const marcaDe = (campo: CampoRevision): Gravedad | null =>
    pendientes.find((r) => r.campo === campo && r.anio === null)?.gravedad ?? null;

  function guardar(cambios: CambiosMonotributo) {
    startGuardar(async () => {
      const r = await guardarFichaMonotributo(clienteId, cambios);
      if ("error" in r) setErr(r.error);
      else {
        setErr(null);
        if (r.ficha) setFicha(r.ficha);
        ofrecer(r.historialIds, "Cambio guardado", recargar);
      }
    });
  }

  function confirmar(id: string) {
    startGuardar(async () => {
      const r = await confirmarRevisiones([id], nota);
      if ("error" in r) return setErr(r.error);
      setErr(null);
      setConfirmando(null);
      setFicha(await obtenerFichaMonotributo(clienteId));
      ofrecer(r.historialIds, "Marca confirmada", recargar);
    });
  }

  /** La categoría es del mes (pasa sola a los meses siguientes): se guarda en el mes de trabajo. */
  function guardarCategoria(categoria: string | null) {
    if (!ficha?.mostrar) return;
    const { anio, mes } = ficha.mesTrabajo;
    startGuardar(async () => {
      const r = await upsertMonotributoTarea(clienteId, anio, mes, { categoria });
      if (r && "error" in r && r.error) return setErr(r.error);
      setErr(null);
      setFicha(await obtenerFichaMonotributo(clienteId));
      if (r && "historialIds" in r) ofrecer(r.historialIds, "Categoría guardada", recargar);
    });
  }

  /** La deuda se guarda en el mes de trabajo (pasa sola a los meses siguientes), igual que en Seguimiento. */
  function guardarDeuda(cambios: CambiosTarea) {
    if (!ficha?.mostrar) return;
    const { anio, mes } = ficha.mesTrabajo;
    setVerDeuda(false);
    startGuardar(async () => {
      const r = await upsertMonotributoTarea(clienteId, anio, mes, cambios);
      if (r && "error" in r && r.error) return setErr(r.error);
      setErr(null);
      setFicha(await obtenerFichaMonotributo(clienteId));
      if (r && "historialIds" in r) ofrecer(r.historialIds, "Deuda guardada", recargar);
    });
  }

  /** Reasigna desde el mes en curso (queda en "Historial de responsables" y en el historial del cliente). */
  function reasignar(responsableId: string) {
    const hoy = new Date();
    startGuardar(async () => {
      const r = await crearAsignacionServicio(clienteId, "monotributo", "general", responsableId, hoy.getFullYear(), hoy.getMonth() + 1, null, null);
      if (r.error) return setErr(r.error);
      setErr(null);
      setFicha(await obtenerFichaMonotributo(clienteId));
      ofrecer(r.historialIds, "Responsable cambiado", recargar);
    });
  }

  function recargar() {
    obtenerFichaMonotributo(clienteId).then(setFicha);
  }

  function reabrir(id: string) {
    startGuardar(async () => {
      const r = await reabrirRevision(id);
      if ("error" in r) return setErr(r.error);
      setErr(null);
      recargar();
    });
  }

  const deshabilitado = !puedeEditar || guardando;

  return (
    <div className="space-y-3">
      <p className="text-[10.5px] font-semibold tracking-[.1em] uppercase text-gray-400 border-b border-gray-100 pb-1.5 flex items-center gap-2">
        Monotributo
        {guardando && <Loader2 size={11} className="animate-spin text-gray-400" />}
        {datos.alta_por_importacion && (
          <span className="normal-case tracking-normal font-medium text-[10.5px] text-amber-700 bg-amber-50 rounded px-1.5">
            Alta por importación
          </span>
        )}
      </p>

      {pendientes.length > 0 && (
        <div className="space-y-1">
          {pendientes.map((r) => (
            <div
              key={r.id}
              className={clsx(
                "text-[12px] rounded-md border px-2 py-1",
                r.gravedad === "rojo" ? "bg-red-50 border-red-200 text-red-700" : "bg-amber-50 border-amber-200 text-amber-800"
              )}
            >
              <div className="flex items-start gap-2">
                <p className="flex-1">
                  <span className="font-semibold">A revisar · {CAMPO_REVISION_LABEL[r.campo]}</span>
                  {r.anio && r.mes ? ` (${String(r.mes).padStart(2, "0")}/${r.anio})` : ""}: {r.motivo}
                </p>
                {puedeEditar && confirmando !== r.id && (
                  <button
                    type="button"
                    disabled={guardando}
                    onClick={() => { setConfirmando(r.id); setNota(""); }}
                    className="shrink-0 text-[11px] underline underline-offset-2 opacity-80 hover:opacity-100"
                  >
                    Está bien así
                  </button>
                )}
              </div>
              {confirmando === r.id && (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <input
                    autoFocus
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                    placeholder="Nota opcional"
                    className="flex-1 min-w-0 text-[11.5px] text-gray-800 border border-gray-200 rounded px-1.5 py-0.5 bg-white"
                  />
                  <button type="button" disabled={guardando} onClick={() => confirmar(r.id)}
                    className="text-[11px] font-semibold text-gray-900 bg-white border border-gray-300 rounded px-2 py-0.5">
                    Confirmar
                  </button>
                  <button type="button" onClick={() => setConfirmando(null)} className="text-[11px] text-gray-500">
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Fila label={`Categoría (${MESES_NOMBRES[ficha.mesTrabajo.mes]})`}>
          <select
            value={ficha.categoria ?? ""}
            disabled={deshabilitado}
            onChange={(e) => guardarCategoria(e.target.value || null)}
            className={inputCls}
          >
            <option value="">Sin categoría</option>
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Fila>

        <Fila label={`Deuda (${MESES_NOMBRES[ficha.mesTrabajo.mes]})`} marca={marcaDe("deuda")}>
          <button
            type="button"
            onClick={() => setVerDeuda(true)}
            className={clsx(
              inputCls, "text-left",
              ficha.deuda.deuda_estado === "si" ? (ficha.deuda.deuda_resuelta ? "text-emerald-700" : "text-red-700") : "text-gray-700"
            )}
          >
            {ficha.deuda.deuda_estado === "si"
              ? (ficha.deuda.deuda_resuelta ? "Abonada" : `Sí${ficha.deuda.deuda_aviso ? " · avisada" : " · sin avisar"}`)
              : DEUDA_LABEL[ficha.deuda.deuda_estado]}
          </button>
        </Fila>

        <Fila label="Responsable" marca={marcaDe("responsable")}>
          {puedeEditar ? (
            <select
              value={ficha.responsableId ?? ""}
              disabled={deshabilitado}
              onChange={(e) => e.target.value && reasignar(e.target.value)}
              className={inputCls}
              title="Cambia el responsable desde este mes"
            >
              {!ficha.responsableId && <option value="">Sin responsable</option>}
              {ficha.responsableId && !ficha.equipoResponsables.some((p) => p.id === ficha.responsableId) && (
                <option value={ficha.responsableId}>{ficha.responsable ?? "—"}</option>
              )}
              {ficha.equipoResponsables.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          ) : (
            <span className="text-[12.5px] text-gray-800">{ficha.responsable ?? "Sin responsable"}</span>
          )}
        </Fila>

        <Fila label="Forma de pago" marca={marcaDe("forma_pago")}>
          <select
            value={datos.forma_pago ?? ""}
            disabled={deshabilitado}
            onChange={(e) => guardar({ forma_pago: (e.target.value || null) as CambiosMonotributo["forma_pago"] })}
            className={inputCls}
          >
            <option value="">—</option>
            {FORMAS_PAGO.map((f) => (
              <option key={f} value={f}>{FORMA_PAGO_LABEL[f]}</option>
            ))}
          </select>
        </Fila>

        <Fila label="Envío">
          <div className="flex items-center gap-3 text-[12.5px] text-gray-700">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={datos.avisa} disabled={deshabilitado}
                onChange={(e) => guardar({ avisa: e.target.checked })} className="accent-bordo" />
              Avisar
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={datos.envia_vep} disabled={deshabilitado}
                onChange={(e) => guardar({ envia_vep: e.target.checked })} className="accent-bordo" />
              Enviar VEP/QR
            </label>
          </div>
        </Fila>

        <Fila label="Medio" marca={marcaDe("medio_contacto")}>
          <select
            value={datos.medio ?? ""}
            disabled={deshabilitado}
            onChange={(e) => guardar({ medio: (e.target.value || null) as CambiosMonotributo["medio"] })}
            className={inputCls}
          >
            <option value="">—</option>
            {MEDIOS.map((m) => (
              <option key={m} value={m}>{MEDIO_LABEL[m]}</option>
            ))}
          </select>
        </Fila>

        <Texto label="Destinatario" valor={datos.destinatario} disabled={deshabilitado}
          onGuardar={(v) => guardar({ destinatario: v })} />
        <Texto label="Empresa / grupo" valor={datos.empresa_grupo} disabled={deshabilitado}
          onGuardar={(v) => guardar({ empresa_grupo: v })} />

        <Texto
          label="Mails"
          valor={datos.mails.join("; ")}
          disabled={deshabilitado}
          marca={datos.medio === "mail" ? marcaDe("medio_contacto") : null}
          placeholder="separados por ;"
          onGuardar={(v) => guardar({ mails: parsearMails(v ?? "") })}
        />
        <Texto
          label="WhatsApp"
          valor={datos.whatsapp}
          disabled={deshabilitado}
          marca={datos.medio === "whatsapp" ? marcaDe("medio_contacto") : null}
          onGuardar={(v) => guardar({ whatsapp: v })}
        />

        <Fila label="Paga desde la cuenta de">
          <select
            value={datos.paga_desde_cliente_id ?? ""}
            disabled={deshabilitado}
            onChange={(e) => guardar({ paga_desde_cliente_id: e.target.value || null })}
            className={inputCls}
          >
            <option value="">—</option>
            {ficha.opcionesPagaDesde.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </Fila>
        <Texto label="Paga desde (aclaración)" valor={datos.paga_desde_texto} disabled={deshabilitado}
          onGuardar={(v) => guardar({ paga_desde_texto: v })} />

        <Texto
          label="Saldo a favor"
          valor={datos.saldo_a_favor === null ? null : String(datos.saldo_a_favor)}
          disabled={deshabilitado}
          placeholder="ej. 130185.21"
          onGuardar={(v) => {
            const n = v === null ? null : Number(v.replace(/\s/g, "").replace(",", "."));
            if (n !== null && !Number.isFinite(n)) return setErr("Saldo a favor: ingresá un número.");
            guardar({ saldo_a_favor: n });
          }}
        />
        <Texto label="Resolución ARBA" valor={datos.resolucion_arba} disabled={deshabilitado}
          onGuardar={(v) => guardar({ resolucion_arba: v })} />
      </div>

      <Texto label="Observaciones" valor={datos.observaciones} disabled={deshabilitado} multilinea
        onGuardar={(v) => guardar({ observaciones: v })} />

      {resueltas.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setVerHistorial((v) => !v)}
            className="text-[11.5px] text-gray-500 hover:text-gray-800"
          >
            {verHistorial ? "Ocultar" : "Ver"} revisiones resueltas ({resueltas.length})
          </button>
          {verHistorial && (
            <div className="mt-1.5 space-y-1">
              {resueltas.map((r) => (
                <p key={r.id} className="text-[11.5px] text-gray-500">
                  {CAMPO_REVISION_LABEL[r.campo]}: {r.motivo} —{" "}
                  {r.resolucion === "confirmado" ? "confirmado así" : "corregido"}
                  {r.resuelta_por_nombre ? ` por ${r.resuelta_por_nombre}` : ""} el {fmtFechaHoraAR(r.resuelta_at)}
                  {r.nota ? ` · “${r.nota}”` : ""}
                  {puedeEditar && (
                    <button type="button" disabled={guardando} onClick={() => reabrir(r.id)} className="ml-1.5 text-amber-700 hover:underline disabled:opacity-50">
                      Reabrir
                    </button>
                  )}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      <HistorialCliente clienteId={clienteId} puedeRevertir={puedeEditar} onRevertido={recargar} />

      {datos.updated_at && (
        <p className="text-[10.5px] text-gray-400">Última modificación: {fmtFechaHoraAR(datos.updated_at)}</p>
      )}
      {err && <p className="text-[11px] text-danger">{err}</p>}
      {avisoDeshacer}
      {verDeuda && (
        <DeudaMonotributoModal
          nombre={nombreCliente ?? ""}
          tarea={ficha.deuda}
          mes={ficha.mesTrabajo.mes}
          anio={ficha.mesTrabajo.anio}
          puedeEditar={puedeEditar}
          onGuardar={guardarDeuda}
          onClose={() => setVerDeuda(false)}
        />
      )}
    </div>
  );
}

const ETIQUETA_CAMPO: Record<string, string> = {
  cuota_estado: "Estado del mes", cuota_fecha: "Fecha de pago", recategorizacion: "Recategorización", categoria: "Categoría",
  deuda_estado: "Deuda", deuda_periodos: "Períodos adeudados", deuda_monto: "Importe de deuda", deuda_aviso: "Deuda avisada",
  deuda_aviso_fecha: "Fecha de aviso de deuda", deuda_resuelta: "Deuda resuelta", deuda_resuelta_fecha: "Fecha deuda resuelta",
  deuda_nota: "Nota de la deuda", intimacion_estado: "Intimación", intimacion_fecha: "Fecha de intimación", observaciones: "Observaciones",
  forma_pago: "Forma de pago", paga_desde_cliente_id: "Paga desde la cuenta de", paga_desde_texto: "Paga desde (aclaración)",
  avisa: "Avisar", envia_vep: "Enviar VEP/QR", medio: "Medio", destinatario: "Destinatario", mails: "Mails", whatsapp: "WhatsApp",
  empresa_grupo: "Empresa / grupo", saldo_a_favor: "Saldo a favor", resolucion_arba: "Resolución ARBA", responsable_id: "Responsable",
  total_facturado: "Facturado 12 meses", ficha_enviada: "Ficha enviada al cliente", ficha_enviada_fecha: "Fecha de envío de la ficha", nota: "Nota",
};

const VALOR_TEXTO: Record<string, string> = {
  ...ESTADO_MES_LABEL, ...FORMA_PAGO_LABEL, ...MEDIO_LABEL,
  sin_verificar: "Sin verificar", no_corresponde: "No corresponde", realizada: "Realizada", fijarse: "Fijarse", si: "Sí", no: "No",
};

function fmtValor(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (Array.isArray(v)) return v.length ? v.join("; ") : "—";
  if (typeof v === "object") {
    const o = v as { estado?: string; resolucion?: string };
    return o.estado === "pendiente" ? "Pendiente" : o.resolucion === "confirmado" ? "Confirmada así" : o.resolucion === "corregido" ? "Corregida" : "Resuelta";
  }
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.split("-").reverse().join("/");
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(s)) return "(persona/cliente)";
  return VALOR_TEXTO[s] ?? s;
}

/** Historial de cambios del cliente con "Revertir" (revertir no borra: crea una entrada nueva). */
function HistorialCliente({ clienteId, puedeRevertir, onRevertido }: { clienteId: string; puedeRevertir: boolean; onRevertido: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState<{ entradas: EntradaHistorialVista[]; disponible: boolean } | null>(null);
  const [mas, setMas] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [trabajando, startTrabajo] = useTransition();

  function cargar(desde = 0) {
    obtenerHistorialCliente(clienteId, desde).then((d) => {
      setMas(d.entradas.length === 50);
      setDatos((prev) => (desde === 0 || !prev ? d : { ...d, entradas: [...prev.entradas, ...d.entradas] }));
    });
  }

  function revertir(e: EntradaHistorialVista, forzar = false) {
    setErr(null);
    startTrabajo(async () => {
      const r = await revertirCambio(e.id, forzar);
      if ("error" in r) return setErr(r.error);
      if ("conflicto" in r) {
        if (window.confirm(`"${ETIQUETA_CAMPO[e.campo] ?? e.campo}" cambió después de este registro (hoy vale: ${fmtValor(r.actual)}). ¿Revertir igual a ${fmtValor(e.valor_anterior)}?`)) revertir(e, true);
        return;
      }
      cargar(0);
      onRevertido();
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => { setAbierto((v) => !v); if (!datos) cargar(0); }}
        className="text-[11.5px] font-medium text-gray-600 hover:text-gray-900"
      >
        {abierto ? "Ocultar historial de cambios" : "Historial de cambios"}
      </button>
      {abierto && (
        <div className="mt-2 space-y-1.5">
          {!datos ? (
            <p className="text-[11.5px] text-gray-400 flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" /> Cargando…</p>
          ) : !datos.disponible ? (
            <p className="text-[11.5px] text-gray-400">El historial todavía no está activo (falta correr su SQL).</p>
          ) : datos.entradas.length === 0 ? (
            <p className="text-[11.5px] text-gray-400">Sin cambios registrados.</p>
          ) : (
            datos.entradas.map((e) => (
              <div key={e.id} className="text-[11.5px] text-gray-600 flex items-start gap-2 border-b border-gray-50 pb-1">
                <div className="flex-1">
                  <span className="font-medium text-gray-800">{ETIQUETA_CAMPO[e.campo] ?? CAMPO_REVISION_LABEL[e.campo as CampoRevision] ?? e.campo}</span>
                  {e.anio && e.mes ? <span className="text-gray-400"> ({String(e.mes).padStart(2, "0")}/{e.anio})</span> : null}
                  : {fmtValor(e.valor_anterior)} → <span className="text-gray-900">{fmtValor(e.valor_nuevo)}</span>
                  <span className="block text-[10.5px] text-gray-400">
                    {fmtFechaHoraAR(e.creado_en)} · {e.usuario ?? "automático"}
                    {e.revierte_id ? " · reversión" : ""}{e.nota && !e.revierte_id ? ` · ${e.nota}` : ""}
                  </span>
                </div>
                {e.revertida ? (
                  <span className="text-[10.5px] text-gray-400 shrink-0">revertido</span>
                ) : puedeRevertir && (e.entidad === "tarea" || e.entidad === "ficha") ? (
                  <button disabled={trabajando} onClick={() => revertir(e)} className="text-[11px] text-amber-700 hover:underline shrink-0 disabled:opacity-50">
                    Revertir
                  </button>
                ) : null}
              </div>
            ))
          )}
          {datos?.disponible && mas && datos.entradas.length > 0 && (
            <button onClick={() => cargar(datos.entradas.length)} className="text-[11px] text-gray-500 hover:text-gray-800">Ver más</button>
          )}
          {err && <p className="text-[11px] text-danger">{err}</p>}
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full text-[12.5px] border border-gray-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:border-bordo disabled:bg-transparent disabled:border-transparent disabled:px-0 disabled:text-gray-800 disabled:appearance-none";

function Fila({ label, marca, children }: { label: string; marca?: Gravedad | null; children: React.ReactNode }) {
  return (
    <div className={clsx("rounded-md", marca && clsx("border px-2 py-1", MARCA[marca]))}>
      <p className="text-[10px] font-semibold tracking-[.08em] uppercase text-gray-400 mb-0.5">{label}</p>
      {children}
    </div>
  );
}

function Texto({
  label,
  valor,
  disabled,
  marca,
  placeholder,
  multilinea,
  onGuardar,
}: {
  label: string;
  valor: string | null;
  disabled: boolean;
  marca?: Gravedad | null;
  placeholder?: string;
  multilinea?: boolean;
  onGuardar: (v: string | null) => void;
}) {
  const [texto, setTexto] = useState(valor ?? "");
  useEffect(() => setTexto(valor ?? ""), [valor]);

  function confirmar() {
    const limpio = texto.trim();
    if (limpio === (valor ?? "").trim()) return;
    onGuardar(limpio === "" ? null : limpio);
  }

  return (
    <Fila label={label} marca={marca}>
      {disabled && !texto ? (
        <span className="text-[12.5px] text-gray-800">—</span>
      ) : multilinea ? (
        <textarea
          value={texto}
          disabled={disabled}
          rows={2}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={confirmar}
          className={clsx(inputCls, "resize-y")}
        />
      ) : (
        <input
          value={texto}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={confirmar}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          className={inputCls}
        />
      )}
    </Fila>
  );
}
