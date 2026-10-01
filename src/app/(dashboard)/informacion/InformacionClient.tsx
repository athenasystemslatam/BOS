"use client";

import { useRef, useState, useTransition } from "react";
import { Plus, X, AlertTriangle, Pencil, Trash2, StickyNote, Bold, Italic, Strikethrough } from "lucide-react";
import clsx from "clsx";
import { Toggle } from "@/components/Toggle";
import { useBackdropClose } from "@/lib/useBackdropClose";
import { NotaSueldos, ModuloNota } from "@/types";
import { crearNota, editarNota, borrarNota } from "./actions";

const MODULOS: { value: ModuloNota; label: string }[] = [
  { value: "general", label: "General" },
  { value: "seguimiento", label: "Seguimiento" },
  { value: "clientes", label: "Clientes" },
  { value: "vencimientos", label: "Vencimientos" },
  { value: "equipo", label: "Equipo" },
];

const MODULO_LABEL: Record<string, string> = Object.fromEntries(MODULOS.map((m) => [m.value, m.label]));

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
  const [modulo, setModulo] = useState<ModuloNota>(nota?.modulo ?? "general");
  const [contacto, setContacto] = useState(nota?.contacto ?? "");
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
    formData.set("modulo", modulo);
    formData.set("contacto", contacto);
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Módulo</label>
              <select
                value={modulo}
                onChange={(e) => setModulo(e.target.value as ModuloNota)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-bordo bg-white transition-colors"
              >
                {MODULOS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Contacto <span className="text-gray-300 font-normal">(opcional)</span>
              </label>
              <input
                value={contacto}
                onChange={(e) => setContacto(e.target.value)}
                placeholder="Nombre, teléfono..."
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-bordo focus:ring-1 focus:ring-bordo/20 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Contenido</label>
            <RichTextarea value={contenido} onChange={setContenido} />
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

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" {...backdrop}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {nota.importante && <AlertTriangle size={14} className="text-amber-500 shrink-0" />}
              <h2 className="text-[15px] font-semibold text-gray-900 break-words">{nota.tema}</h2>
            </div>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="text-[11px] font-medium bg-bordo/10 text-bordo px-2 py-0.5 rounded-full">
                {MODULO_LABEL[nota.modulo] ?? nota.modulo}
              </span>
              {nota.contacto && (
                <span className="text-[11px] text-gray-500">· {nota.contacto}</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors shrink-0 ml-3">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1 text-[13px] text-gray-700 leading-relaxed">
          {nota.contenido ? renderRico(nota.contenido) : <span className="text-gray-300">Sin contenido.</span>}
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
  const [filtroModulo, setFiltroModulo] = useState<string>("todos");
  const [soloImportantes, setSoloImportantes] = useState(false);
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<NotaSueldos | null>(null);
  const [viendo, setViendo] = useState<NotaSueldos | null>(null);
  const [verAlEditar, setVerAlEditar] = useState(false);

  const filtradas = notas.filter((n) => {
    if (filtroModulo !== "todos" && n.modulo !== filtroModulo) return false;
    if (soloImportantes && !n.importante) return false;
    return true;
  });

  function cerrarYRefrescar() {
    setCreando(false);
    setEditando(null);
    setVerAlEditar(false);
    // Next revalida la lista solo (revalidatePath en la action); no hace
    // falta recargar toda la página.
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
        <select
          value={filtroModulo}
          onChange={(e) => setFiltroModulo(e.target.value)}
          className="text-[12.5px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-bordo transition-colors"
        >
          <option value="todos">Todos los módulos</option>
          {MODULOS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
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
        <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
          {filtradas.map((n) => (
            <button
              key={n.id}
              onClick={() => setViendo(n)}
              className={clsx(
                "text-left bg-white rounded-xl border shadow-sm p-4 hover:shadow-md transition-shadow",
                n.importante ? "border-amber-200" : "border-gray-100"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-[13.5px] font-semibold text-gray-900 leading-snug line-clamp-2">{n.tema}</p>
                {n.importante && <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />}
              </div>
              <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                <span className="text-[10.5px] font-medium bg-bordo/10 text-bordo px-2 py-0.5 rounded-full">
                  {MODULO_LABEL[n.modulo] ?? n.modulo}
                </span>
                {n.contacto && <span className="text-[11px] text-gray-400 truncate">{n.contacto}</span>}
              </div>
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
