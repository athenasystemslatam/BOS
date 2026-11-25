// Esqueleto gris que aparece al instante al entrar a una pantalla, mientras
// llegan los datos (mismo diseño que el de Libros): evita la sensación de que
// el click "no hizo nada". Cada módulo lo usa desde su loading.tsx.
export function CargandoPagina({ color }: { color: string }) {
  return (
    <div className="flex flex-col h-full bg-appbg text-ink" aria-busy="true" aria-label="Cargando">
      <div className="shrink-0 px-4 sm:px-6 pt-5 pb-3 flex flex-wrap items-center gap-3">
        <span className={`w-1 h-6 rounded shrink-0 ${color}`} />
        <div className="h-6 w-40 rounded-md bg-line-panel animate-pulse" />
      </div>
      <div className="flex-1 min-h-0 px-4 sm:px-6 pb-6 space-y-3">
        <div className="flex gap-2">
          <div className="h-9 w-56 rounded-[9px] bg-line-panel/70 animate-pulse" />
          <div className="h-9 w-36 rounded-[9px] bg-line-panel/70 animate-pulse" />
        </div>
        <div className="bg-paper border border-line-panel rounded-xl divide-y divide-line-row">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex gap-4 px-4 py-3">
              <div className="h-4 w-1/4 rounded bg-line-panel animate-pulse" />
              <div className="h-4 w-1/6 rounded bg-line-row animate-pulse" />
              <div className="h-4 w-1/5 rounded bg-line-row animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
