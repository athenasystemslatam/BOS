// Definición única de los módulos del sistema (Sueldos, Impuestos, Contable,
// Monotributo, Libros) y de los servicios/subtipos que se pueden asignar por
// empresa. Fuente de verdad reutilizada en varios lugares que antes tenían
// cada uno su propia copia de esta lista, corriendo el riesgo de desincronizarse:
// - el checklist de "Servicios activos" en Panel General (NuevoClienteModal)
// - la validación de áreas al editar un miembro del equipo (equipo/actions.ts)
// - qué secciones del menú lateral le corresponden a cada persona (Sidebar)

export const MODULOS_VALIDOS = ["sueldos", "impuestos", "contable", "monotributo", "libros"] as const;

export type ModuloId = (typeof MODULOS_VALIDOS)[number];

export const MODULO_LABELS: Record<ModuloId, string> = {
  sueldos: "Sueldos",
  impuestos: "Impuestos",
  contable: "Contable",
  monotributo: "Monotributo",
  libros: "Libros",
};

export function esModuloValido(valor: string): valor is ModuloId {
  return (MODULOS_VALIDOS as readonly string[]).includes(valor);
}

export interface ServicioConfig {
  servicio: string;
  subtipo: string;
  label: string;
  modulo: ModuloId;
}

// Servicios que puede tildar Panel General al crear/editar una empresa. Un
// mismo módulo puede tener más de un servicio (Impuestos se abre en IVA,
// IIBB y Seg. e Hig. por separado).
export const SERVICIOS_CONFIG: ServicioConfig[] = [
  { servicio: "sueldos",     subtipo: "general", label: "Sueldos",                 modulo: "sueldos" },
  { servicio: "impuestos",   subtipo: "iva",     label: "Impuestos — IVA",         modulo: "impuestos" },
  { servicio: "impuestos",   subtipo: "iibb",    label: "Impuestos — IIBB",        modulo: "impuestos" },
  { servicio: "impuestos",   subtipo: "seh",     label: "Impuestos — Seg. e Hig.", modulo: "impuestos" },
  { servicio: "contable",    subtipo: "general", label: "Contable",                modulo: "contable" },
  { servicio: "monotributo", subtipo: "general", label: "Monotributo",             modulo: "monotributo" },
  { servicio: "libros",      subtipo: "general", label: "Libros",                  modulo: "libros" },
];
