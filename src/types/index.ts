export type Rol = "admin" | "supervisor" | "liquidadora" | "viewer";
export type EstadoCliente = "activo" | "inactivo";
export type TipoContribuyente = "empresa" | "monotributista" | "inscripto";

export interface ClaveAcceso {
  sistema: string;
  usuario: string;
  contrasena: string;
  url: string;
}

export interface Liquidadora {
  id: string;
  nombre: string;
  email: string | null;
  rol: Rol;
  activa: boolean;
  fecha_alta: string;
  fecha_baja?: string | null;
  user_id?: string;
}

export interface Cliente {
  id: string;
  nombre: string;
  cuit: string;
  terminacion_cuit: number;
  cuil_arca?: string;
  liquidador_id: string;
  tipo_contribuyente: TipoContribuyente;
  es_quincenal: boolean;
  tiene_sindicato: boolean;
  sindicato_nombre?: string;
  tiene_rubrica_lsd: boolean;
  jurisdiccion?: string;
  art?: string;
  red_bancaria?: string;
  estado: EstadoCliente;
  observaciones?: string;
  claves_acceso?: ClaveAcceso[];
  drive_folder_id?: string;
  fecha_alta: string;
  fecha_alta_empleador?: string;
  fecha_baja?: string;
  fecha_modificacion: string;
  creado_por?: string;
  liquidadora?: Liquidadora;
}

export interface AlertaPostcierre {
  id: string;
  cliente_id: string;
  periodo_id: string;
  campo: string;
  modificado_at: string;
  cliente?: { nombre: string };
  periodo?: { nombre_mes: string };
}

export interface Periodo {
  id: string;
  anio: number;
  mes: number;
  nombre_mes: string;
}

export interface Tarea {
  id: string;
  cliente_id: string;
  periodo_id: string;
  rec_q1: boolean;
  recibos: boolean;
  f931: boolean;
  bol_sind: boolean;
  rub_lsd: boolean;
  sac: boolean;
  legajos_cantidad: number;
  rec_q1_manual: boolean;
  recibos_manual: boolean;
  f931_manual: boolean;
  bol_sind_manual: boolean;
  rub_lsd_manual: boolean;
  sac_manual: boolean;
  rec_q1_drive: boolean;
  recibos_drive: boolean;
  f931_drive: boolean;
  bol_sind_drive: boolean;
  rub_lsd_drive: boolean;
  sac_drive: boolean;
  observaciones?: string;
  recordatorio?: string;
  cliente?: Cliente;
  periodo?: Periodo;
}

export interface Asignacion {
  id: string;
  cliente_id: string;
  liquidador_id: string;
  desde_anio: number;
  desde_mes: number;
  creado_por: string | null;
  creado_en: string;
  motivo: string | null;
  liquidadora?: Pick<Liquidadora, "id" | "nombre">;
}

export interface DriveLog {
  id: string;
  cliente_id: string;
  periodo_id: string;
  archivo_nombre: string;
  archivo_url?: string;
  tarea_detectada: string;
  fecha_deteccion: string;
}

export interface ResumenLiquidadora {
  liquidadora: Liquidadora;
  total_empresas: number;
  recibos_ok: number;
  f931_ok: number;
  pendientes: number;
}

export interface VencimientoF931 {
  cliente: Cliente;
  fecha_vencimiento: Date;
  dias_restantes: number;
}
