import { ENCABEZADO, PAGINA, PANEL, RAYA_MODULO } from "./ui";

// Aparece al instante al navegar entre pantallas de Libros, mientras llegan
// los datos: evita la sensación de que el click "no hizo nada".
export default function CargandoLibros() {
  return (
    <div className={PAGINA} aria-busy="true" aria-label="Cargando">
      <div className={ENCABEZADO}>
        <span className={RAYA_MODULO} />
        <div className="h-6 w-40 rounded-md bg-line-panel animate-pulse" />
      </div>
      <div className="flex-1 min-h-0 px-4 sm:px-6 pb-6 space-y-3">
        <div className="flex gap-2">
          <div className="h-9 w-56 rounded-[9px] bg-line-panel/70 animate-pulse" />
          <div className="h-9 w-36 rounded-[9px] bg-line-panel/70 animate-pulse" />
        </div>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${PANEL} p-4 space-y-2.5`}>
            <div className="h-4 w-1/3 rounded bg-line-panel animate-pulse" />
            <div className="h-3 w-2/3 rounded bg-line-row animate-pulse" />
            <div className="h-3 w-1/2 rounded bg-line-row animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
