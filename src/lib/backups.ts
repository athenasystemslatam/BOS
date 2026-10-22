// Registro de qué tablas componen el "backup" de cada tablero — volcado
// crudo (todas las columnas, sin formatear) pensado para restaurar info si
// se pierde algo, no para leer prolijo. Lo usa /api/backup/[modulo].
// Separado del patrón "Exportar" (src/app/api/exportar/*), que arma un
// reporte prolijo para mandar afuera (facturación, ficha de cliente, etc).

export type BackupModulo =
  | "panel-general"
  | "sueldos"
  | "impuestos"
  | "contable"
  | "monotributo"
  | "libros";

export const BACKUPS: Record<BackupModulo, { label: string; tablas: string[] }> = {
  "panel-general": {
    label: "Panel General",
    // "equipo" se unificó en "liquidadoras" (ver supabase/unificar_equipo.sql)
    // — no existe como tabla propia en la base.
    tablas: ["clientes", "servicios_cliente", "asignaciones_servicio", "equipo_modulos", "liquidadoras"],
  },
  sueldos: {
    label: "Sueldos",
    tablas: ["periodos", "tareas", "asignaciones", "historial_asignaciones", "sueldos_notas"],
  },
  impuestos: {
    label: "Impuestos",
    tablas: ["impuestos_tareas"],
  },
  contable: {
    label: "Contable",
    tablas: ["balances", "balance_frenados"],
  },
  monotributo: {
    label: "Monotributo",
    tablas: ["monotributo_tareas"],
  },
  libros: {
    label: "Libros",
    tablas: [
      "clientes_societario",
      "libros_catalogo",
      "libros",
      "libros_estados",
      "libros_pedidos",
      "libros_pedidos_seguimientos",
      "libros_tareas",
      "libros_movimientos",
      "libros_incidencias",
      "copiadora_facturas",
      "copiadora_facturas_tareas",
      "libros_config",
      "libros_avisos_mandato",
      "libros_objetivos",
      "libros_snapshot",
      "libros_preferencias",
    ],
  },
};

export function esBackupModuloValido(valor: string): valor is BackupModulo {
  return Object.prototype.hasOwnProperty.call(BACKUPS, valor);
}
