-- ============================================================
-- BOS · KMA Consultores — Backup de ESTRUCTURA (sin datos)
-- Generado a partir de un export de information_schema.columns
-- corrido en Supabase SQL Editor el 27-nov-2026.
--
-- OJO, limitaciones de este archivo (no es un pg_dump real):
--  - Las FOREIGN KEY están listadas pero SIN la tabla/columna de
--    destino (ese dato no vino en el export) — revisar supabase/*.sql
--    o volver a exportar con la consulta ampliada si hace falta exacto.
--  - No incluye políticas RLS, funciones, triggers ni índices.
--  - Los tipos ARRAY y USER-DEFINED (enums) quedaron aproximados
--    porque el export no trae el tipo base exacto.
--  - Es una foto del 27-nov-2026 — no se actualiza sola.
-- ============================================================

CREATE TABLE public.accesos_bloqueados (
  email text NOT NULL,
  motivo text,
  bloqueado_por text,
  bloqueado_en timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (email)
);

CREATE TABLE public.alertas_postcierre (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  periodo_id uuid NOT NULL,
  campo text NOT NULL,
  modificado_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);
-- FKs de alertas_postcierre: cliente_id -> (ver migraciones, no incluido en este export); periodo_id -> (ver migraciones, no incluido en este export)

CREATE TABLE public.asignaciones (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  liquidador_id uuid NOT NULL,
  desde_anio integer NOT NULL,
  desde_mes integer NOT NULL,
  creado_por uuid,
  creado_en timestamp with time zone NOT NULL DEFAULT now(),
  motivo text,
  PRIMARY KEY (id)
);
-- FKs de asignaciones: cliente_id -> (ver migraciones, no incluido en este export); liquidador_id -> (ver migraciones, no incluido en este export); creado_por -> (ver migraciones, no incluido en este export)

CREATE TABLE public.asignaciones_servicio (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  servicio text NOT NULL,
  subtipo text NOT NULL DEFAULT 'general'::text,
  responsable_id uuid NOT NULL,
  desde_anio integer NOT NULL,
  desde_mes integer NOT NULL,
  motivo text,
  creado_por text,
  creado_en timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);
-- FKs de asignaciones_servicio: cliente_id -> (ver migraciones, no incluido en este export); responsable_id -> (ver migraciones, no incluido en este export)
-- UNIQUE en asignaciones_servicio: cliente_id, servicio, subtipo, desde_anio, desde_mes

CREATE TABLE public.backup_contactos_20261118 (
  cliente_id uuid,
  telefono text,
  emails_contacto text[],
  emails_contacto_detalle jsonb,
  mono_mails text[],
  mono_whatsapp text,
  copiado_en timestamp with time zone
);

CREATE TABLE public.backup_historial (
  id bigint NOT NULL DEFAULT nextval('backup_historial_id_seq'::regclass),
  tipo text NOT NULL,
  modulo text NOT NULL,
  tamanio_bytes bigint NOT NULL,
  creado_en timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE public.balance_frenados (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  balance_id uuid NOT NULL,
  desde timestamp with time zone NOT NULL,
  hasta timestamp with time zone,
  creado_en timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);
-- FKs de balance_frenados: balance_id -> (ver migraciones, no incluido en este export)

CREATE TABLE public.balances (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  anio_fiscal integer NOT NULL,
  fecha_cierre date NOT NULL,
  responsable_id uuid,
  responsable2_id uuid,
  estado text NOT NULL DEFAULT 'sin_asignar'::text,
  avance integer NOT NULL DEFAULT 0,
  envio1 boolean NOT NULL DEFAULT false,
  envio1_fecha timestamp with time zone,
  envio2 boolean NOT NULL DEFAULT false,
  envio2_fecha date,
  envio3 boolean NOT NULL DEFAULT false,
  envio3_fecha date,
  info_recibida boolean NOT NULL DEFAULT false,
  estado_eecc text NOT NULL DEFAULT 'pendiente'::text,
  f855_estado text NOT NULL DEFAULT 'pendiente'::text,
  f899_estado text NOT NULL DEFAULT 'pendiente'::text,
  f713_estado text NOT NULL DEFAULT 'pendiente'::text,
  f657_estado text NOT NULL DEFAULT 'pendiente'::text,
  igj_presentacion text NOT NULL DEFAULT 'pendiente'::text,
  igj_tasa text NOT NULL DEFAULT 'pendiente'::text,
  observaciones text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  info_recibida_fecha timestamp with time zone,
  legalizado_fecha timestamp with time zone,
  presentado_fecha timestamp with time zone,
  frenado_desde timestamp with time zone,
  f855_fecha timestamp with time zone,
  asignado_fecha timestamp with time zone,
  en_proceso_fecha timestamp with time zone,
  pendiente_pago_fecha timestamp with time zone,
  vto_ganancias date,
  no_corresponde_motivo text,
  no_corresponde_desde timestamp with time zone,
  presentado_fecha_real boolean NOT NULL DEFAULT false,
  f855_fecha_real boolean NOT NULL DEFAULT false,
  igj_numero text,
  PRIMARY KEY (id)
);
-- FKs de balances: cliente_id -> (ver migraciones, no incluido en este export); responsable_id -> (ver migraciones, no incluido en este export); responsable2_id -> (ver migraciones, no incluido en este export)
-- UNIQUE en balances: cliente_id, anio_fiscal

CREATE TABLE public.calendario_arca (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  anio integer NOT NULL,
  mes integer NOT NULL,
  fecha_vencimiento_cuota date NOT NULL,
  fecha_limite_recategorizacion date,
  recategoriza_desde date,
  nota text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_por uuid,
  PRIMARY KEY (id)
);
-- FKs de calendario_arca: updated_por -> (ver migraciones, no incluido en este export)
-- UNIQUE en calendario_arca: anio, mes

CREATE TABLE public.clientes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  cuit text NOT NULL,
  terminacion_cuit integer NOT NULL,
  liquidador_id uuid,
  tipo text NOT NULL DEFAULT 'mensual'::text,
  tiene_sindicato boolean DEFAULT false,
  sindicato_nombre text,
  tiene_rubrica_lsd boolean DEFAULT false,
  jurisdiccion text,
  art text,
  red_bancaria text,
  estado text NOT NULL DEFAULT 'activo'::text,
  observaciones text,
  fecha_alta timestamp with time zone DEFAULT now(),
  fecha_baja timestamp with time zone,
  fecha_modificacion timestamp with time zone DEFAULT now(),
  creado_por uuid,
  claves_acceso jsonb DEFAULT '[]'::jsonb,
  cuil_arca text,
  fecha_alta_empleador date,
  tipo_contribuyente text DEFAULT 'empresa'::text,
  es_quincenal boolean DEFAULT false,
  drive_folder_id text,
  lsd_desde_anio integer,
  lsd_desde_mes integer,
  lsd_hasta_anio integer,
  lsd_hasta_mes integer,
  alicuota_art text,
  emails_contacto text[] NOT NULL DEFAULT '{}'::text[],
  fecha_inicio_liquidacion date,
  telefono text,
  jurisdiccion_empresa text,
  domicilio_fiscal text,
  domicilio_legal text,
  jurisdiccion_fiscal text,
  jurisdiccion_legal text,
  tiene_locales boolean DEFAULT false,
  locales jsonb DEFAULT '[]'::jsonb,
  emails_contacto_detalle jsonb DEFAULT '[]'::jsonb,
  cierre_ejercicio_mes integer,
  cierre_ejercicio_dia integer,
  fecha_alta_estudio date,
  id_fal text,
  telefonos_detalle jsonb NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (id)
);
-- FKs de clientes: liquidador_id -> (ver migraciones, no incluido en este export); creado_por -> (ver migraciones, no incluido en este export)
-- UNIQUE en clientes: cuit

CREATE TABLE public.clientes_autoridades (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  cargo text NOT NULL,
  nombre text NOT NULL,
  dni_cuit text,
  fecha_desde date,
  fecha_hasta date,
  vigente boolean NOT NULL DEFAULT true,
  renovacion_id uuid,
  observaciones text,
  creado_en timestamp with time zone NOT NULL DEFAULT now(),
  actualizado_en timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);
-- FKs de clientes_autoridades: cliente_id -> (ver migraciones, no incluido en este export); renovacion_id -> (ver migraciones, no incluido en este export)

CREATE TABLE public.clientes_cierre_cambios (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  mes_anterior integer,
  dia_anterior integer,
  mes_nuevo integer,
  dia_nuevo integer,
  motivo text NOT NULL,
  creado_en timestamp with time zone NOT NULL DEFAULT now(),
  creado_por uuid,
  PRIMARY KEY (id)
);
-- FKs de clientes_cierre_cambios: cliente_id -> (ver migraciones, no incluido en este export); creado_por -> (ver migraciones, no incluido en este export)

CREATE TABLE public.clientes_fal (
  cliente_id uuid NOT NULL,
  aviso_enviado boolean NOT NULL DEFAULT false,
  aviso_enviado_en timestamp with time zone,
  aviso_enviado_por uuid,
  respondio boolean NOT NULL DEFAULT false,
  respondio_en timestamp with time zone,
  respondio_por uuid,
  id_fal_en timestamp with time zone,
  id_fal_por uuid,
  confirmado_arca boolean NOT NULL DEFAULT false,
  confirmado_arca_en timestamp with time zone,
  confirmado_arca_por uuid,
  asignado_default boolean NOT NULL DEFAULT false,
  default_motivo text,
  default_aplicado_en timestamp with time zone,
  actualizado_en timestamp with time zone NOT NULL DEFAULT now(),
  actualizado_por uuid,
  PRIMARY KEY (cliente_id)
);
-- FKs de clientes_fal: cliente_id -> (ver migraciones, no incluido en este export); aviso_enviado_por -> (ver migraciones, no incluido en este export); respondio_por -> (ver migraciones, no incluido en este export); id_fal_por -> (ver migraciones, no incluido en este export); confirmado_arca_por -> (ver migraciones, no incluido en este export); actualizado_por -> (ver migraciones, no incluido en este export)

CREATE TABLE public.clientes_societario (
  cliente_id uuid NOT NULL,
  tipo_societario text,
  organismo text,
  nro_inscripcion text,
  libros_digitales boolean NOT NULL DEFAULT false,
  contacto_libros text,
  mandato_designacion date,
  mandato_anios integer,
  observaciones text,
  actualizado_por uuid,
  actualizado_en timestamp with time zone NOT NULL DEFAULT now(),
  mandato_vence_preciso date,
  PRIMARY KEY (cliente_id)
);
-- FKs de clientes_societario: cliente_id -> (ver migraciones, no incluido en este export); actualizado_por -> (ver migraciones, no incluido en este export)

CREATE TABLE public.contable_vto_manual (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  balance_id uuid NOT NULL,
  tipo text NOT NULL,
  fecha date NOT NULL,
  motivo text NOT NULL,
  creado_en timestamp with time zone NOT NULL DEFAULT now(),
  creado_por uuid,
  PRIMARY KEY (id)
);
-- FKs de contable_vto_manual: balance_id -> (ver migraciones, no incluido en este export); creado_por -> (ver migraciones, no incluido en este export)
-- UNIQUE en contable_vto_manual: balance_id, tipo

CREATE TABLE public.contable_vto_prorrogas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tipo text NOT NULL,
  cierre_desde date NOT NULL,
  cierre_hasta date NOT NULL,
  fecha date NOT NULL,
  motivo text NOT NULL,
  creado_en timestamp with time zone NOT NULL DEFAULT now(),
  creado_por uuid,
  PRIMARY KEY (id)
);
-- FKs de contable_vto_prorrogas: creado_por -> (ver migraciones, no incluido en este export)

CREATE TABLE public.copiadora_facturas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  proveedor text NOT NULL DEFAULT 'Arena Mattioni'::text,
  cliente_id uuid NOT NULL,
  nro_factura text,
  fecha_factura date,
  mes date,
  monto numeric(14),
  factura_recibida boolean NOT NULL DEFAULT false,
  reenviada_cliente boolean NOT NULL DEFAULT false,
  pagado boolean NOT NULL DEFAULT false,
  comprobante_enviado boolean NOT NULL DEFAULT false,
  observaciones text,
  creado_por uuid,
  creado_en timestamp with time zone NOT NULL DEFAULT now(),
  actualizado_en timestamp with time zone NOT NULL DEFAULT now(),
  libros_texto text,
  PRIMARY KEY (id)
);
-- FKs de copiadora_facturas: cliente_id -> (ver migraciones, no incluido en este export); creado_por -> (ver migraciones, no incluido en este export)

CREATE TABLE public.copiadora_facturas_tareas (
  factura_id uuid NOT NULL,
  tarea_id uuid NOT NULL,
  PRIMARY KEY (factura_id, tarea_id)
);
-- FKs de copiadora_facturas_tareas: factura_id -> (ver migraciones, no incluido en este export); tarea_id -> (ver migraciones, no incluido en este export)

CREATE TABLE public.drive_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  periodo_id uuid NOT NULL,
  archivo_nombre text NOT NULL,
  archivo_url text,
  tarea_detectada text NOT NULL,
  fecha_deteccion timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);
-- FKs de drive_log: cliente_id -> (ver migraciones, no incluido en este export); periodo_id -> (ver migraciones, no incluido en este export)

CREATE TABLE public.equipo_legacy (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  activo boolean DEFAULT true,
  PRIMARY KEY (id)
);

CREATE TABLE public.equipo_modulos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  equipo_id uuid NOT NULL,
  modulo text NOT NULL,
  PRIMARY KEY (id)
);
-- FKs de equipo_modulos: equipo_id -> (ver migraciones, no incluido en este export)
-- UNIQUE en equipo_modulos: equipo_id, modulo

CREATE TABLE public.historial_asignaciones (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  liquidador_anterior_id uuid,
  liquidador_nuevo_id uuid NOT NULL,
  fecha_cambio timestamp with time zone DEFAULT now(),
  cambiado_por uuid NOT NULL,
  motivo text,
  PRIMARY KEY (id)
);
-- FKs de historial_asignaciones: cliente_id -> (ver migraciones, no incluido en este export); liquidador_anterior_id -> (ver migraciones, no incluido en este export); liquidador_nuevo_id -> (ver migraciones, no incluido en este export); cambiado_por -> (ver migraciones, no incluido en este export)

CREATE TABLE public.impuestos_tareas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  subtipo text NOT NULL,
  anio integer NOT NULL,
  mes integer NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente'::text,
  fecha_presentacion date,
  pago_estado text NOT NULL DEFAULT 'pendiente'::text,
  observaciones text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);
-- FKs de impuestos_tareas: cliente_id -> (ver migraciones, no incluido en este export)
-- UNIQUE en impuestos_tareas: cliente_id, subtipo, anio, mes

CREATE TABLE public.libros (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  catalogo_id uuid NOT NULL,
  tomo integer NOT NULL DEFAULT 1,
  soporte text NOT NULL DEFAULT 'fisico'::text,
  estado text NOT NULL DEFAULT 'activo'::text,
  rubrica_nro text,
  rubrica_fecha date,
  folios_totales integer,
  folios_usados integer NOT NULL DEFAULT 0,
  ultimo_periodo_copiado date,
  periodicidad text,
  ubicacion text NOT NULL DEFAULT 'estudio'::text,
  ubicacion_detalle text,
  observaciones text,
  creado_en timestamp with time zone NOT NULL DEFAULT now(),
  actualizado_en timestamp with time zone NOT NULL DEFAULT now(),
  extraviado boolean NOT NULL DEFAULT false,
  PRIMARY KEY (id)
);
-- FKs de libros: cliente_id -> (ver migraciones, no incluido en este export); catalogo_id -> (ver migraciones, no incluido en este export)
-- UNIQUE en libros: cliente_id, catalogo_id, tomo

CREATE TABLE public.libros_avisos_mandato (
  cliente_id uuid NOT NULL,
  mandato_vence date NOT NULL,
  umbral integer NOT NULL,
  enviado_en timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (cliente_id, mandato_vence, umbral)
);
-- FKs de libros_avisos_mandato: cliente_id -> (ver migraciones, no incluido en este export)

CREATE TABLE public.libros_catalogo (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tipo_societario text NOT NULL,
  codigo text NOT NULL,
  nombre text NOT NULL,
  orden integer NOT NULL DEFAULT 0,
  dispara_con_balance boolean NOT NULL DEFAULT false,
  periodicidad text NOT NULL DEFAULT 'evento'::text,
  activo boolean NOT NULL DEFAULT true,
  PRIMARY KEY (id)
);
-- UNIQUE en libros_catalogo: tipo_societario, codigo

CREATE TABLE public.libros_config (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  umbral_folios integer NOT NULL DEFAULT 10,
  mandato_avisos text[] NOT NULL DEFAULT '{90,60,30}'::integer[],
  fecha_meta_puesta date,
  mail_diario_excluidos text[] NOT NULL DEFAULT '{}'::uuid[],
  mail_semanal_ids text[],
  mail_semanal_dia integer NOT NULL DEFAULT 5,
  PRIMARY KEY (id)
);

CREATE TABLE public.libros_estados (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  orden integer NOT NULL DEFAULT 0,
  es_final boolean NOT NULL DEFAULT false,
  codigo text,
  activo boolean NOT NULL DEFAULT true,
  PRIMARY KEY (id)
);
-- UNIQUE en libros_estados: codigo

CREATE TABLE public.libros_incidencias (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  libro_id uuid,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  tipo text NOT NULL DEFAULT 'extravio'::text,
  situacion text NOT NULL,
  resolucion text,
  resuelto boolean NOT NULL DEFAULT false,
  registrado_por uuid,
  creado_en timestamp with time zone NOT NULL DEFAULT now(),
  actualizado_en timestamp with time zone NOT NULL DEFAULT now(),
  cliente_id uuid,
  libros_texto text,
  importado boolean NOT NULL DEFAULT false,
  PRIMARY KEY (id)
);
-- FKs de libros_incidencias: libro_id -> (ver migraciones, no incluido en este export); registrado_por -> (ver migraciones, no incluido en este export); cliente_id -> (ver migraciones, no incluido en este export)

CREATE TABLE public.libros_movimientos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  libro_id uuid,
  tarea_id uuid,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  tipo text NOT NULL,
  destino text NOT NULL,
  persona text,
  es_mensajeria boolean NOT NULL DEFAULT false,
  comentario text,
  registrado_por uuid,
  creado_en timestamp with time zone NOT NULL DEFAULT now(),
  cliente_id uuid,
  libros_texto text,
  importado boolean NOT NULL DEFAULT false,
  acta_numero text,
  PRIMARY KEY (id)
);
-- FKs de libros_movimientos: libro_id -> (ver migraciones, no incluido en este export); tarea_id -> (ver migraciones, no incluido en este export); registrado_por -> (ver migraciones, no incluido en este export); cliente_id -> (ver migraciones, no incluido en este export)

CREATE TABLE public.libros_objetivos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  metrica text NOT NULL,
  meta numeric(5) NOT NULL,
  fecha_limite date,
  estado text NOT NULL DEFAULT 'actual'::text,
  fecha_cumplimiento date,
  orden integer NOT NULL DEFAULT 0,
  creado_en timestamp with time zone NOT NULL DEFAULT now(),
  actualizado_en timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE public.libros_pedidos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  libro_id uuid,
  tipo text NOT NULL,
  descripcion text,
  fecha_pedido date NOT NULL DEFAULT CURRENT_DATE,
  fecha_limite date,
  estado text NOT NULL DEFAULT 'abierto'::text,
  ultimo_seguimiento date,
  proximo_seguimiento date,
  monto numeric(14),
  respuesta text,
  automatico boolean NOT NULL DEFAULT false,
  creado_por uuid,
  creado_en timestamp with time zone NOT NULL DEFAULT now(),
  actualizado_en timestamp with time zone NOT NULL DEFAULT now(),
  responsable_id uuid,
  solicitante text,
  prioridad text,
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  mandato_vence date,
  fecha_envio_cliente date,
  fecha_respuesta date,
  orden_manual integer NOT NULL DEFAULT 0,
  PRIMARY KEY (id)
);
-- FKs de libros_pedidos: cliente_id -> (ver migraciones, no incluido en este export); libro_id -> (ver migraciones, no incluido en este export); creado_por -> (ver migraciones, no incluido en este export); responsable_id -> (ver migraciones, no incluido en este export)

CREATE TABLE public.libros_pedidos_seguimientos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  nota text NOT NULL,
  proximo_seguimiento date,
  registrado_por uuid,
  creado_en timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);
-- FKs de libros_pedidos_seguimientos: pedido_id -> (ver migraciones, no incluido en este export); registrado_por -> (ver migraciones, no incluido en este export)

CREATE TABLE public.libros_preferencias (
  email text NOT NULL,
  dashboard_orden text[] NOT NULL DEFAULT '{}'::text[],
  actualizado_en timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (email)
);

CREATE TABLE public.libros_relevamiento (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente'::text,
  fecha date,
  relevado_por uuid,
  notas text,
  creado_en timestamp with time zone NOT NULL DEFAULT now(),
  actualizado_en timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);
-- FKs de libros_relevamiento: cliente_id -> (ver migraciones, no incluido en este export); relevado_por -> (ver migraciones, no incluido en este export)
-- UNIQUE en libros_relevamiento: cliente_id

CREATE TABLE public.libros_snapshot (
  fecha date NOT NULL,
  es_base boolean NOT NULL DEFAULT false,
  periodos_pendientes integer NOT NULL,
  libros_atrasados integer NOT NULL,
  libros_al_dia integer NOT NULL,
  libros_sin_dato integer NOT NULL,
  libros_sin_libro integer NOT NULL,
  envios_pendientes integer NOT NULL DEFAULT 0,
  por_libro jsonb NOT NULL DEFAULT '{}'::jsonb,
  actualizado_en timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (fecha)
);

CREATE TABLE public.libros_tareas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  libro_id uuid NOT NULL,
  origen text NOT NULL DEFAULT 'manual'::text,
  balance_id uuid,
  pedido_id uuid,
  periodo_desde date,
  periodo_hasta date,
  estado_id uuid NOT NULL,
  fecha_limite date,
  material_listo boolean NOT NULL DEFAULT false,
  prioridad_manual text,
  prioridad_motivo text,
  prioridad_cambiada_por uuid,
  prioridad_cambiada_en timestamp with time zone,
  orden_manual integer NOT NULL DEFAULT 0,
  insistencias integer NOT NULL DEFAULT 0,
  responsable_id uuid,
  fecha_envio_copiar date,
  fecha_retiro date,
  fecha_fin date,
  folios_usados integer,
  requiere_reformateo boolean NOT NULL DEFAULT false,
  observaciones text,
  creado_por uuid,
  creado_en timestamp with time zone NOT NULL DEFAULT now(),
  actualizado_en timestamp with time zone NOT NULL DEFAULT now(),
  quitada_en timestamp with time zone,
  quitada_por uuid,
  quitada_motivo text,
  PRIMARY KEY (id)
);
-- FKs de libros_tareas: cliente_id -> (ver migraciones, no incluido en este export); libro_id -> (ver migraciones, no incluido en este export); balance_id -> (ver migraciones, no incluido en este export); pedido_id -> (ver migraciones, no incluido en este export); estado_id -> (ver migraciones, no incluido en este export); prioridad_cambiada_por -> (ver migraciones, no incluido en este export); responsable_id -> (ver migraciones, no incluido en este export); creado_por -> (ver migraciones, no incluido en este export); quitada_por -> (ver migraciones, no incluido en este export)

CREATE TABLE public.liquidadoras (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  nombre text NOT NULL,
  email text,
  rol text NOT NULL DEFAULT 'liquidadora'::text,
  activa boolean DEFAULT true,
  fecha_alta timestamp with time zone DEFAULT now(),
  fecha_baja timestamp with time zone,
  equipo_id uuid,
  PRIMARY KEY (id)
);
-- FKs de liquidadoras: user_id -> (ver migraciones, no incluido en este export); equipo_id -> (ver migraciones, no incluido en este export)
-- UNIQUE en liquidadoras: user_id, email

CREATE TABLE public.monitoreo_crecimiento (
  id bigint NOT NULL DEFAULT nextval('monitoreo_crecimiento_id_seq'::regclass),
  tabla text NOT NULL,
  filas integer NOT NULL,
  creado_en timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE public.monotributo_alertas_resueltas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  tipo text NOT NULL,
  anio integer NOT NULL,
  mes integer NOT NULL,
  valor text,
  nota text,
  resuelta_por uuid,
  resuelta_at timestamp with time zone NOT NULL DEFAULT now(),
  reabierta_at timestamp with time zone,
  reabierta_por uuid,
  PRIMARY KEY (id)
);
-- FKs de monotributo_alertas_resueltas: cliente_id -> (ver migraciones, no incluido en este export); resuelta_por -> (ver migraciones, no incluido en este export); reabierta_por -> (ver migraciones, no incluido en este export)

CREATE TABLE public.monotributo_categorias (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL,
  categoria text NOT NULL,
  tope_anual numeric(16) NOT NULL,
  cuota_servicios numeric(14),
  cuota_venta numeric(14),
  PRIMARY KEY (id)
);
-- FKs de monotributo_categorias: version_id -> (ver migraciones, no incluido en este export)
-- UNIQUE en monotributo_categorias: version_id, categoria

CREATE TABLE public.monotributo_categorias_versiones (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  vigente_desde date NOT NULL,
  fuente text,
  nota text,
  creado_por uuid,
  creado_en timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);
-- FKs de monotributo_categorias_versiones: creado_por -> (ver migraciones, no incluido en este export)
-- UNIQUE en monotributo_categorias_versiones: vigente_desde

CREATE TABLE public.monotributo_clientes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  forma_pago text,
  paga_desde_cliente_id uuid,
  paga_desde_texto text,
  avisa boolean NOT NULL DEFAULT false,
  envia_vep boolean NOT NULL DEFAULT false,
  medio text,
  destinatario text,
  mails text[] NOT NULL DEFAULT '{}'::text[],
  whatsapp text,
  empresa_grupo text,
  saldo_a_favor numeric,
  resolucion_arba text,
  alta_por_importacion boolean NOT NULL DEFAULT false,
  observaciones text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_por uuid,
  PRIMARY KEY (id)
);
-- FKs de monotributo_clientes: cliente_id -> (ver migraciones, no incluido en este export); paga_desde_cliente_id -> (ver migraciones, no incluido en este export); updated_por -> (ver migraciones, no incluido en este export)
-- UNIQUE en monotributo_clientes: cliente_id

CREATE TABLE public.monotributo_config (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  clave text NOT NULL,
  valor jsonb NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_por uuid,
  PRIMARY KEY (clave)
);
-- FKs de monotributo_config: updated_por -> (ver migraciones, no incluido en este export)

CREATE TABLE public.monotributo_controles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  anio integer NOT NULL,
  mes integer NOT NULL,
  fecha_corte date NOT NULL,
  es_cierre_semestre boolean NOT NULL DEFAULT false,
  nota text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_por uuid,
  PRIMARY KEY (id)
);
-- FKs de monotributo_controles: updated_por -> (ver migraciones, no incluido en este export)
-- UNIQUE en monotributo_controles: anio, mes

CREATE TABLE public.monotributo_eventos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  anio integer NOT NULL,
  mes integer NOT NULL,
  estado_anterior text,
  estado_nuevo text NOT NULL,
  canal text,
  origen text NOT NULL DEFAULT 'manual'::text,
  nota text,
  creado_por uuid,
  creado_en timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);
-- FKs de monotributo_eventos: cliente_id -> (ver migraciones, no incluido en este export); creado_por -> (ver migraciones, no incluido en este export)

CREATE TABLE public.monotributo_facturacion (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  control_id uuid NOT NULL,
  total_facturado numeric(16),
  origen text NOT NULL DEFAULT 'manual'::text,
  archivo_id uuid,
  ficha_enviada boolean NOT NULL DEFAULT false,
  ficha_enviada_fecha date,
  nota text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_por uuid,
  PRIMARY KEY (id)
);
-- FKs de monotributo_facturacion: cliente_id -> (ver migraciones, no incluido en este export); control_id -> (ver migraciones, no incluido en este export); archivo_id -> (ver migraciones, no incluido en este export); updated_por -> (ver migraciones, no incluido en este export)
-- UNIQUE en monotributo_facturacion: cliente_id, control_id

CREATE TABLE public.monotributo_facturacion_archivos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  control_id uuid NOT NULL,
  nombre_archivo text,
  comprobantes integer,
  total_facturas numeric(16),
  total_notas_credito numeric(16),
  total_neto numeric(16),
  subido_por uuid,
  subido_en timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);
-- FKs de monotributo_facturacion_archivos: cliente_id -> (ver migraciones, no incluido en este export); control_id -> (ver migraciones, no incluido en este export); subido_por -> (ver migraciones, no incluido en este export)

CREATE TABLE public.monotributo_historial (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente_id uuid,
  anio integer,
  mes integer,
  entidad text NOT NULL,
  campo text NOT NULL,
  valor_anterior jsonb,
  valor_nuevo jsonb,
  usuario_id uuid,
  creado_en timestamp with time zone NOT NULL DEFAULT now(),
  revierte_id uuid,
  ref_id uuid,
  nota text,
  PRIMARY KEY (id)
);
-- FKs de monotributo_historial: cliente_id -> (ver migraciones, no incluido en este export); usuario_id -> (ver migraciones, no incluido en este export); revierte_id -> (ver migraciones, no incluido en este export)

CREATE TABLE public.monotributo_revisiones (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  anio integer,
  mes integer,
  campo text NOT NULL,
  motivo text NOT NULL,
  gravedad text NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente'::text,
  origen text NOT NULL,
  detectada_at timestamp with time zone NOT NULL DEFAULT now(),
  resuelta_por uuid,
  resuelta_at timestamp with time zone,
  resolucion text,
  nota text,
  valor_confirmado text,
  PRIMARY KEY (id)
);
-- FKs de monotributo_revisiones: cliente_id -> (ver migraciones, no incluido en este export); resuelta_por -> (ver migraciones, no incluido en este export)

CREATE TABLE public.monotributo_tareas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  anio integer NOT NULL,
  mes integer NOT NULL,
  cuota_estado text NOT NULL DEFAULT 'pendiente'::text,
  cuota_fecha date,
  recategorizacion text NOT NULL DEFAULT 'no_corresponde'::text,
  categoria text,
  observaciones text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deuda_monto numeric,
  deuda_aviso boolean NOT NULL DEFAULT false,
  deuda_aviso_fecha date,
  estado_cambiado_en timestamp with time zone,
  estado_cambiado_por uuid,
  canal text,
  origen text NOT NULL DEFAULT 'manual'::text,
  vep_drive_file_id text,
  vep_importe numeric,
  vep_vencimiento date,
  deuda_estado text NOT NULL DEFAULT 'sin_verificar'::text,
  deuda_periodos text,
  deuda_texto_original text,
  deuda_resuelta boolean NOT NULL DEFAULT false,
  deuda_resuelta_fecha date,
  intimacion_estado text,
  intimacion_fecha date,
  deuda_nota text,
  PRIMARY KEY (id)
);
-- FKs de monotributo_tareas: cliente_id -> (ver migraciones, no incluido en este export); estado_cambiado_por -> (ver migraciones, no incluido en este export)
-- UNIQUE en monotributo_tareas: cliente_id, anio, mes

CREATE TABLE public.objetivos_area (
  area text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid,
  PRIMARY KEY (area)
);
-- FKs de objetivos_area: updated_by -> (ver migraciones, no incluido en este export)

CREATE TABLE public.objetivos_excepcion_cliente (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  area text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en timestamp with time zone NOT NULL DEFAULT now(),
  creado_por uuid,
  PRIMARY KEY (id)
);
-- FKs de objetivos_excepcion_cliente: cliente_id -> (ver migraciones, no incluido en este export); creado_por -> (ver migraciones, no incluido en este export)
-- UNIQUE en objetivos_excepcion_cliente: cliente_id, area

CREATE TABLE public.periodos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  anio integer NOT NULL,
  mes integer NOT NULL,
  nombre_mes text NOT NULL,
  PRIMARY KEY (id)
);
-- UNIQUE en periodos: anio, mes

CREATE TABLE public.servicios_cliente (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  servicio text NOT NULL,
  subtipo text NOT NULL DEFAULT 'general'::text,
  responsable_id uuid,
  fecha_alta timestamp with time zone NOT NULL DEFAULT now(),
  estado boolean DEFAULT true,
  fecha_baja timestamp with time zone,
  PRIMARY KEY (id)
);
-- FKs de servicios_cliente: cliente_id -> (ver migraciones, no incluido en este export); responsable_id -> (ver migraciones, no incluido en este export)
-- UNIQUE en servicios_cliente: cliente_id, servicio, subtipo

CREATE TABLE public.sueldos_notas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tema text NOT NULL,
  contenido text NOT NULL DEFAULT ''::text,
  importante boolean NOT NULL DEFAULT false,
  creado_por uuid,
  creado_en timestamp with time zone NOT NULL DEFAULT now(),
  actualizado_en timestamp with time zone NOT NULL DEFAULT now(),
  contactos jsonb NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (id)
);
-- FKs de sueldos_notas: creado_por -> (ver migraciones, no incluido en este export)

CREATE TABLE public.tareas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  periodo_id uuid NOT NULL,
  rec_q1 boolean DEFAULT false,
  recibos boolean DEFAULT false,
  f931 boolean DEFAULT false,
  bol_sind boolean DEFAULT false,
  rub_lsd boolean DEFAULT false,
  sac boolean DEFAULT false,
  legajos_cantidad integer DEFAULT 0,
  rec_q1_manual boolean DEFAULT false,
  recibos_manual boolean DEFAULT false,
  f931_manual boolean DEFAULT false,
  bol_sind_manual boolean DEFAULT false,
  rub_lsd_manual boolean DEFAULT false,
  sac_manual boolean DEFAULT false,
  rec_q1_drive boolean DEFAULT false,
  recibos_drive boolean DEFAULT false,
  f931_drive boolean DEFAULT false,
  bol_sind_drive boolean DEFAULT false,
  rub_lsd_drive boolean DEFAULT false,
  sac_drive boolean DEFAULT false,
  observaciones text,
  recordatorio text,
  f931_manual_en timestamp with time zone,
  recibos_manual_en timestamp with time zone,
  drive_error text,
  preliquidado boolean NOT NULL DEFAULT false,
  preliquidado_fecha timestamp with time zone,
  novedades_recibidas boolean NOT NULL DEFAULT false,
  novedades_recibidas_fecha timestamp with time zone,
  PRIMARY KEY (id)
);
-- FKs de tareas: cliente_id -> (ver migraciones, no incluido en este export); periodo_id -> (ver migraciones, no incluido en este export)
-- UNIQUE en tareas: cliente_id, periodo_id

CREATE TABLE public.vista_empresas (
  id uuid,
  nombre text,
  cuit text,
  estado text,
  responsable_sueldos text,
  responsable_impuestos_iva text,
  responsable_impuestos_iibb text,
  responsable_impuestos_seh text,
  responsable_contable text,
  responsable_libros text,
  responsable_monotributo text,
  emails_contacto text[],
  fecha_inicio_liquidacion date,
  tipo_contribuyente text
);

