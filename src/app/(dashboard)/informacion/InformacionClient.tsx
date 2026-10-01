"use client";

import { useRef, useState, useTransition } from "react";
import { Plus, X, AlertTriangle, Pencil, Trash2, StickyNote, Bold, Italic, Strikethrough, Users } from "lucide-react";
import clsx from "clsx";
import { Toggle } from "@/components/Toggle";
import { useBackdropClose } from "@/lib/useBackdropClose";
import { NotaSueldos, ContactoNota } from "@/types";
import { crearNota, editarNota, borrarNota } from "./actions";

function fechaCorta(iso: string) {
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ─── Texto con formato liviano (sin librería — negrita **, itálica *, tachado ~~) ──

function renderRico(texto: string): React.ReactNode {
  if (!texto) return null;
  const partes = texto.split(/(\*\*[^*\n]+\*\*|~~[^~\n]+~~|\*[^*\n]+\*|\n)/g).filter((p) => p !== "");
  return partes.map((p, i) => {
    if (p === "\n") return <br key={i} />;
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("~~") && p.endsWith("~~")) return <s key={i}>{p.slice(2, -2)}</s>;
    if (p.startsWith("*") && p.endsWith("*")) return <em key={i}>{p.slice(1, -1)}</em>;
    return p;
  });
}

function RichTextarea({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function envolver(marcador: string) {
    const ta = ref.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e, value: actual } = ta;
    const seleccion = actual.slice(s, e) || "texto";
    const nuevo = actual.slice(0, s) + marcador + seleccion + marcador + actual.slice(e);
    onChange(nuevo);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(s + marcador.length, s + marcador.length + seleccion.length);
    });
  }

  return (
    <div>
      <div className="flex items-center gap-1 mb-1.5">
        <button type="button" onClick={() => envolver("**")} title="Negrita" className="w-7 h-7 rounded-md border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:text-bordo transition-colors">
          <Bold size={13} />
        </button>
        <button type="button" onClick={() => envolver("*")} title="Itálica" className="w-7 h-7 rounded-md border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:text-bordo transition-colors">
          <Italic size={13} />
        </button>
        <button type="button" onClick={() => envolver("~~")} title="Tachado" className="w-7 h-7 rounded-md border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:text-bordo transition-colors">
          <Strikethrough size={13} />
        </button>
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        placeholder="Escribí la nota acá — seleccioná texto y usá los botones de arriba para darle formato"
        className="w-full text-[13px] text-gray-700 border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-bordo focus:ring-1 focus:ring-bordo resize-none"
      />
    </div>
  );
}

// ─── Lista de contactos (nombre + a quién corresponde + observaciones) ────────────

const MAX_CONTACTOS = 10;

function ContactosEditor({ contactos, onChange }: { contactos: ContactoNota[]; onChange: (c: ContactoNota[]) => void }) {
  function update(i: number, field: keyof ContactoNota, value: string) {
    onChange(contactos.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)));
  }
  function remove(i: number) {
    onChange(contactos.filter((_, idx) => idx !== i));
  }
  function add() {
    if (contactos.length >= MAX_CONTACTOS) return;
    onChange([...contactos, { nombre: "", corresponde: "", observaciones: "" }]);
  }

  return (
    <div className="space-y-2.5">
      {contactos.map((c, i) => (
        <div key={i} className="relative border border-gray-100 rounded-lg p-3 space-y-2">
          <button
            type="button"
            onClick={() => remove(i)}
            className="absolute top-2.5 right-2.5 text-gray-300 hover:text-danger transition-colors"
          >
            <Trash2 size={13} />
          </button>
          <div className="grid grid-cols-2 gap-2 pr-6">
            <input
              value={c.nombre}
              onChange={(e) => update(i, "nombre", e.target.value)}
              placeholder="Nombre / contacto"
              className="text-[13px] border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-bordo"
            />
            <input
              value={c.corresponde}
              onChange={(e) => update(i, "corresponde", e.target.value)}
              placeholder="A quién corresponde"
              className="text-[13px] border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-bordo"
            />
          </div>
          <input
            value={c.observaciones}
            onChange={(e) => update(i, "observaciones", e.target.value)}
            placeholder="Observaciones del contacto"
            className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-bordo"
          />
        </div>
      ))}
      {contactos.length < MAX_CONTACTOS ? (
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-bordo transition-colors"
        >
          <Plus size={13} /> Agregar contacto
        </button>
      ) : (
        <p className="text-[11px] text-gray-300">Máximo {MAX_CONTACTOS} contactos.</p>
      )}
    </div>
  );
}

// ─── Formulario (crear / editar) ───────────────────────────────────────────────

function NotaFormModal({
  nota,
  onClose,
  onSaved,
}: {
  nota: NotaSueldos | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tema, setTema] = useState(nota?.tema ?? "");
  const [contactos, setContactos] = useState<ContactoNota[]>(nota?.contactos ?? []);
  const [contenido, setContenido] = useState(nota?.contenido ?? "");
  const [importante, setImportante] = useState(nota?.importante ?? false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const backdrop = useBackdropClose(onClose);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const formData = new FormData();
    if (nota) formData.set("id", nota.id);
    formData.set("tema", tema);
    formData.set("contactos", JSON.stringify(contactos));
    formData.set("contenido", contenido);
    formData.set("importante", String(importante));

    startTransition(async () => {
      const result = nota ? await editarNota(formData) : await crearNota(formData);
      if (result?.error) setError(result.error);
      else onSaved();
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" {...backdrop}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-gray-900">{nota ? "Editar nota" : "Nuevo ítem"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Tema <span className="text-danger">*</span>
            </label>
            <input
              value={tema}
              onChange={(e) => setTema(e.target.value)}
              required
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-bordo focus:ring-1 focus:ring-bordo/20 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Contenido</label>
            <RichTextarea value={contenido} onChange={setContenido} />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Contactos <span className="text-gray-300 font-normal">(opcional)</span>
            </label>
            <ContactosEditor contactos={contactos} onChange={setContactos} />
          </div>

          <div className="flex items-center justify-between border border-gray-100 rounded-lg p-3">
            <span className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
              <AlertTriangle size={13} className="text-amber-500" />
              Marcar como importante
            </span>
            <Toggle value={importante} onChange={setImportante} />
          </div>

          {error && (
            <p className="text-xs text-danger bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="text-sm font-medium text-gray-500 hover:text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={isPending} className="bg-bordo text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-bordo-dark transition-colors disabled:opacity-60">
              {isPending ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Detalle ────────────────────────────────────────────────────────────────────

function NotaDetalleModal({
  nota,
  puedeEditar,
  onClose,
  onEditar,
  onBorrado,
}: {
  nota: NotaSueldos;
  puedeEditar: boolean;
  onClose: () => void;
  onEditar: () => void;
  onBorrado: () => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [isPending, startTransition] = useTransition();
  const backdrop = useBackdropClose(onClose);

  function handleBorrar() {
    startTransition(async () => {
      await borrarNota(nota.id);
      onBorrado();
    });
  }

  const contactos = nota.contactos ?? [];

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" {...backdrop}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between shrink-0">
          <div className="min-w-0 flex items-center gap-2">
            {nota.importante && <AlertTriangle size={14} className="text-amber-500 shrink-0" />}
            <h2 className="text-[15px] font-semibold text-gray-900 break-words">{nota.tema}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors shrink-0 ml-3">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1 space-y-5">
          <div className="text-[13px] text-gray-700 leading-relaxed">
            {nota.contenido ? renderRico(nota.contenido) : <span className="text-gray-300">Sin contenido.</span>}
          </div>

          {contactos.length > 0 && (
            <div>
              <p className="text-[10.5px] font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Users size={12} /> Contactos
              </p>
              <div className="space-y-2">
                {contactos.map((c, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg px-3 py-2.5 text-[12.5px]">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-semibold text-gray-800">{c.nombre || "—"}</p>
                      {c.corresponde && <p className="text-gray-500 text-[11.5px]">{c.corresponde}</p>}
                    </div>
                    {c.observaciones && (
                      <p className="text-gray-500 mt-1 whitespace-pre-wrap">{c.observaciones}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between shrink-0">
          <p className="text-[11px] text-gray-400">
            {nota.autor?.nombre ?? "—"} · {fechaCorta(nota.creado_en)}
          </p>
          {puedeEditar && (
            <div className="flex items-center gap-2">
              {confirmando ? (
                <>
                  <span className="text-[11px] text-gray-500">¿Borrar esta nota?</span>
                  <button onClick={handleBorrar} disabled={isPending} className="text-[12px] font-medium text-white bg-danger px-3 py-1.5 rounded-md hover:brightness-95 transition-colors disabled:opacity-60">
                    {isPending ? "Borrando…" : "Confirmar"}
                  </button>
                  <button onClick={() => setConfirmando(false)} className="text-[12px] font-medium text-gray-500 hover:text-gray-700 transition-colors">
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => setConfirmando(true)} title="Borrar" className="text-gray-400 hover:text-danger transition-colors p-1.5 rounded-md">
                    <Trash2 size={14} />
                  </button>
                  <button onClick={onEditar} className="flex items-center gap-1.5 text-[12px] font-medium text-bordo hover:text-bordo-dark transition-colors px-2 py-1.5">
                    <Pencil size={13} /> Editar
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Principal ──────────────────────────────────────────────────────────────────

export function InformacionClient({ notas, puedeEditar }: { notas: NotaSueldos[]; puedeEditar: boolean }) {
  const [soloImportantes, setSoloImportantes] = useState(false);
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<NotaSueldos | null>(null);
  const [viendo, setViendo] = useState<NotaSueldos | null>(null);
  const [verAlEditar, setVerAlEditar] = useState(false);

  const filtradas = notas.filter((n) => !soloImportantes || n.importante);

  function cerrarYRefrescar() {
    setCreando(false);
    setEditando(null);
    setVerAlEditar(false);
  }

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 md:mb-8 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mb-1">Sueldos</p>
          <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight flex items-center gap-2">
            <StickyNote size={19} className="text-bordo" />
            Información
          </h1>
          <p className="text-sm text-gray-400 mt-1">Notas y avisos compartidos del equipo de Sueldos</p>
        </div>
        {puedeEditar && (
          <button
            onClick={() => setCreando(true)}
            className="inline-flex items-center gap-2 bg-bordo text-white text-[13px] font-semibold px-4 py-2.5 rounded-lg hover:bg-bordo-dark transition-colors shrink-0"
          >
            <Plus size={15} /> Nuevo ítem
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <button
          onClick={() => setSoloImportantes((v) => !v)}
          className={clsx(
            "inline-flex items-center gap-1.5 text-[12.5px] font-medium px-3 py-2 rounded-lg border transition-colors",
            soloImportantes ? "bg-amber-50 border-amber-300 text-amber-700" : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
          )}
        >
          <AlertTriangle size={13} />
          Solo importantes
        </button>
      </div>

      {filtradas.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-14 text-center">
          <p className="text-sm text-gray-400">No hay notas para mostrar.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtradas.map((n) => (
            <button
              key={n.id}
              onClick={() => setViendo(n)}
              className={clsx(
                "text-left w-full bg-white rounded-xl border shadow-sm px-4 py-3.5 hover:shadow-md transition-shadow flex items-center gap-3",
                n.importante ? "border-amber-200" : "border-gray-100"
              )}
            >
              {n.importante && <AlertTriangle size={15} className="text-amber-500 shrink-0" />}
              <p className="text-[13.5px] font-semibold text-gray-900 shrink-0">{n.tema}</p>
              {n.contenido && (
                <p className="text-[12.5px] text-gray-400 truncate flex-1 min-w-0">{n.contenido.replace(/[*~]/g, "")}</p>
              )}
              {(n.contactos?.length ?? 0) > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] text-gray-400 shrink-0">
                  <Users size={12} /> {n.contactos.length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {creando && (
        <NotaFormModal nota={null} onClose={() => setCreando(false)} onSaved={cerrarYRefrescar} />
      )}
      {editando && (
        <NotaFormModal
          nota={editando}
          onClose={() => { setEditando(null); if (verAlEditar) { setViendo(editando); setVerAlEditar(false); } }}
          onSaved={cerrarYRefrescar}
        />
      )}
      {viendo && !editando && (
        <NotaDetalleModal
          nota={viendo}
          puedeEditar={puedeEditar}
          onClose={() => setViendo(null)}
          onEditar={() => { setEditando(viendo); setVerAlEditar(true); setViendo(null); }}
          onBorrado={() => setViendo(null)}
        />
      )}
    </div>
  );
}
