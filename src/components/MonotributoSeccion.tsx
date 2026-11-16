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
import {
  CAMPO_REVISION_LABEL,
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
export function MonotributoSeccion({ clienteId }: { clienteId: string }) {
  const [ficha, setFicha] = useState<FichaMonotributo | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [verHistorial, setVerHistorial] = useState(false);
  const [guardando, startGuardar] = useTransition();

  useEffect(() => {
    obtenerFichaMonotributo(clienteId).then(setFicha);
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
      }
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
            <p
              key={r.id}
              className={clsx(
                "text-[12px] rounded-md border px-2 py-1",
                r.gravedad === "rojo" ? "bg-red-50 border-red-200 text-red-700" : "bg-amber-50 border-amber-200 text-amber-800"
              )}
            >
              <span className="font-semibold">A revisar · {CAMPO_REVISION_LABEL[r.campo]}</span>
              {r.anio && r.mes ? ` (${String(r.mes).padStart(2, "0")}/${r.anio})` : ""}: {r.motivo}
            </p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Fila label="Responsable" marca={marcaDe("responsable")}>
          <span className="text-[12.5px] text-gray-800">{ficha.responsable ?? "Sin responsable"}</span>
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
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {datos.updated_at && (
        <p className="text-[10.5px] text-gray-400">Última modificación: {fmtFechaHoraAR(datos.updated_at)}</p>
      )}
      {err && <p className="text-[11px] text-danger">{err}</p>}
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
