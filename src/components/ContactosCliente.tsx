"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Pencil } from "lucide-react";
import type { Cliente, EmailContacto, TelefonoContacto } from "@/types";
import { emailsDeCliente, telefonosDeCliente } from "@/lib/contactos";
import { EmailsContactoEditor } from "@/components/EmailsContactoEditor";
import { TelefonosContactoEditor } from "@/components/TelefonosContactoEditor";
import { useDeshacer } from "@/components/DeshacerAviso";
import { guardarContactosCliente, puedeEditarContactos } from "@/app/(dashboard)/panel-general/contactosActions";

/** Mails y teléfonos del cliente en la ficha: los mismos que ven todos los módulos.
 * Se pueden editar acá (quien edita alguno de los módulos del cliente) con historial y Deshacer. */
export function ContactosCliente({ cliente, onGuardado }: { cliente: Cliente; onGuardado: () => void }) {
  const [puede, setPuede] = useState(false);
  const [editando, setEditando] = useState(false);
  const [emails, setEmails] = useState<EmailContacto[]>(emailsDeCliente(cliente));
  const [telefonos, setTelefonos] = useState<TelefonoContacto[]>(telefonosDeCliente(cliente));
  const [err, setErr] = useState<string | null>(null);
  const [guardando, start] = useTransition();
  const { ofrecer, aviso } = useDeshacer();

  useEffect(() => {
    puedeEditarContactos(cliente.id).then(setPuede).catch(() => setPuede(false));
  }, [cliente.id]);

  const emailsVista = emailsDeCliente(cliente);
  const telsVista = telefonosDeCliente(cliente);

  function guardar() {
    setErr(null);
    start(async () => {
      const r = await guardarContactosCliente(cliente.id, emails, telefonos).catch(() => ({ error: "No hay conexión con el servidor." }));
      if ("error" in r) return setErr(r.error);
      setEditando(false);
      ofrecer(r.historialIds, "Contactos guardados", onGuardado);
      onGuardado();
    });
  }

  const titulo = "text-[10px] font-semibold tracking-[.08em] uppercase text-gray-400";

  if (editando) {
    return (
      <div className="space-y-3">
        <div>
          <p className={`${titulo} mb-1.5`}>Teléfonos</p>
          <TelefonosContactoEditor telefonos={telefonos} onChange={setTelefonos} />
        </div>
        <div>
          <p className={`${titulo} mb-1.5`}>Emails de contacto</p>
          <EmailsContactoEditor emails={emails} onChange={setEmails} />
        </div>
        {err && <p className="text-[12px] text-red-600">{err}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => { setEditando(false); setEmails(emailsVista); setTelefonos(telsVista); setErr(null); }}
            className="text-[12px] px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            className="text-[12px] px-3 py-1.5 rounded-lg bg-gray-900 text-white font-medium disabled:opacity-50 flex items-center gap-1.5"
          >
            {guardando && <Loader2 size={12} className="animate-spin" />} Guardar contactos
          </button>
        </div>
        {aviso}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div>
        <p className={titulo}>Teléfono{telsVista.length > 1 ? "s" : ""}</p>
        {telsVista.length ? telsVista.map((t, i) => (
          <p key={i} className="text-[13px] text-gray-800">
            {t.telefono}
            {t.aclaracion && <span className="text-gray-400"> — {t.aclaracion}</span>}
          </p>
        )) : <p className="text-[13px] text-gray-300">—</p>}
      </div>
      <div>
        <p className={titulo}>Emails de contacto</p>
        {emailsVista.length ? emailsVista.map((e, i) => (
          <p key={i} className="text-[13px] text-gray-800 break-all">
            {e.email}
            {e.aclaracion && <span className="text-gray-400"> — {e.aclaracion}</span>}
          </p>
        )) : <p className="text-[13px] text-gray-300">—</p>}
      </div>
      {puede && (
        <button
          type="button"
          onClick={() => { setEmails(emailsVista); setTelefonos(telsVista); setEditando(true); }}
          className="inline-flex items-center gap-1 text-[12px] text-bordo hover:underline"
        >
          <Pencil size={11} /> Editar teléfonos y mails
        </button>
      )}
      {aviso}
    </div>
  );
}
