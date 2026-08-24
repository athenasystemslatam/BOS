# BOS — Contexto para Claude Code

Sistema interno de KMA Consultores para seguimiento de sueldos, impuestos, contable y monotributo.

**Producción:** https://bos-plum.vercel.app  
**Repo:** github.com/athenasystemslatam/BOS  
**Deploy:** Vercel, auto-deploy desde `main`. Cada push a main va directo a producción.

---

## Reglas de trabajo

- **SIEMPRE avisar antes de `git push`, borrar archivos, o cualquier cambio que afecte producción.** Esperar confirmación explícita. El usuario dice "pushea" o "dale" para aprobar.
- No crear archivos de documentación extra a menos que se pida explícitamente.
- No agregar comentarios al código salvo que el WHY sea no obvio.
- No refactorizar código que no está en scope del pedido.
- **Al arrancar una sesión, correr `git pull` antes de tocar código.** Tanto Giuliana como Matías pushean cambios en sesiones separadas — el 24-ago se detectó que el checkout local estaba 4 commits atrás de `origin/main` (dashboards/vencimientos/equipo por módulo + email con dominio propio, ya en producción). Trabajar sobre un checkout viejo puede terminar reconstruyendo algo que ya existe, o generando conflictos al pushear.
- **Si hace falta escritura directa a Supabase (SQL, no a través de la app) y no hay `.env.local` con credenciales reales**: el sandbox de Claude Code reemplaza automáticamente por `[SENSITIVE]` cualquier credencial real que `vercel env pull` intente guardar en disco — no es un bug, no intentar esquivarlo. La vía que funciona: armar el SQL y pedirle al usuario que lo pegue en Supabase Dashboard → SQL Editor (mismo lugar de siempre para migraciones). Para lectura, `claude-in-chrome` contra la app en producción no tiene ese problema — pero ojo, la sesión de Chrome logueada puede estar en "Modo consulta" (no admin) aunque parezca la cuenta correcta.

---

## Stack

- **Next.js 15** App Router — Server Components + Server Actions (`"use server"`)
- **Supabase** — PostgreSQL + Auth (magic link, sin contraseñas)
- **Google Drive API** — service account `bos-drive-reader@bos-sueldos.iam.gserviceaccount.com`
- **Resend** — emails de alerta F.931
- **Vercel** — hosting, auto-deploy
- **GitHub Actions** — cron jobs (Vercel Hobby tiene límite de 10s por función)

---

## Regla crítica: clientes Supabase

```ts
createClient()       // usa sesión del usuario → SOLO para auth
createAdminClient()  // service role, bypassa RLS → usar para TODAS las queries de servidor
```

El control de acceso admin vs liquidadora se maneja en código de aplicación, NO en RLS. Usar siempre `createAdminClient()` en Server Actions y rutas de API. Nunca usar `createClient()` para leer datos de negocio.

---

## Control de accesos (desde agosto 2026)

Tres niveles, todo resuelto en `middleware.ts` + `src/lib/auth.ts` (no en RLS, mismo criterio que el resto):

- **Consulta**: cualquier email `@kmaconsultores.com.ar` sin fila en `liquidadoras` entra en modo solo-lectura. Único write permitido: `updateObservaciones` en `seguimiento/actions.ts` (a propósito sin `requireLiquidadoraOrAdmin`).
- **Liquidadora/Admin**: fila en `liquidadoras` con `user_id` vinculado. Se da de alta desde `/equipo` (`crearLiquidadora` en `equipo/actions.ts`), no requiere tocar Supabase a mano. El rol determina `isAdmin`.
- **Bloqueo**: tabla `accesos_bloqueados` (email, motivo, bloqueado_por, bloqueado_en). Gestionada desde `/equipo` → `BloqueosPanel.tsx` → `bloquearAcceso`/`desbloquearAcceso` en `equipo/actions.ts`.

`middleware.ts` chequea en **cada request** (no solo al loguearse): si el mail está en `accesos_bloqueados` → `signOut()` + redirect. Si el mail no es del dominio Y no tiene fila en `liquidadoras` → mismo corte. Esto es lo que permite cortar sesiones ya abiertas (Supabase Auth no expira sesiones solo — el refresh token se renueva indefinidamente si no se corta a mano).

`getCurrentLiquidadora()` en `lib/auth.ts` respeta `activa: false` — una liquidadora/admin dada de baja (`editarLiquidadora` con `activa: false`) pierde el rol en el siguiente request, sin necesidad de tocar Supabase Auth.

Dominio permitido centralizado en `src/lib/dominio.ts` (sin imports, para ser válido tanto en el runtime Edge de `middleware.ts` como en Node).

`requireLiquidadoraOrAdmin()` (en `lib/auth.ts`) gatea las Server Actions de escritura de seguimiento (`toggleManual`, `updateLegajos`, `updateRecordatorio`, `syncDrive`). `crearEmpresa` en `empresas/actions.ts` no tenía `requireAdmin()` — se agregó (gap preexistente).

### Padrón único de personas (20-ago-2026)

`liquidadoras` dejó de ser "solo Sueldos" — es el único padrón de personas del sistema, para los cuatro módulos. Se sigue llamando `liquidadoras` en la base (evitar el rename físico, toca demasiados archivos del sistema de acceso para cero beneficio funcional), pero en la UI es "Equipo" (`/equipo`, antes `/liquidadoras`).

Dos conceptos separados:
- **`rol`** (`admin`/`liquidadora`/`supervisor`/`viewer`) — sigue siendo solo "es admin o no" (`isAdmin: rol === "admin"` es lo único que el código chequea).
- **`equipo_modulos`** (ya existía, N a N) — ahora es la fuente de verdad de a qué área pertenece cada persona, incluyendo `'sueldos'` como valor válido (antes solo lo usaban Impuestos/Contable/Monotributo). `getAreasDelUsuario()` en `lib/auth.ts` resuelve las áreas del usuario logueado; `requireAreaOrAdmin(modulo)` gatea las Server Actions de escritura de cada módulo nuevo (antes no tenían ningún chequeo de permisos — gap real que quedó cerrado con esto).

`equipo` (la tabla vieja de Impuestos/Contable/Monotributo, sin login) se migró a `liquidadoras` preservando los mismos ids (`unificar_equipo.sql`) y quedó renombrada `equipo_legacy`, sin uso.

Alta de una persona sin email: queda como etiqueta seleccionable (aparece en los desplegables de responsable) pero sin acceso al sistema — no dispara invitación. Se le puede invitar más adelante completándole el email y usando "Reenviar acceso".

---

## Modelo de datos clave

### Personas y acceso
- **`liquidadoras`** — padrón único de personas de todo el sistema, no solo Sueldos (`rol`: `admin` | `liquidadora` | `supervisor` | `viewer`; a qué área pertenece cada una vive en `equipo_modulos`, ver "Padrón único de personas" arriba)
- **`equipo_modulos`** — equipo_id + modulo ('sueldos' | 'contable' | 'impuestos' | 'monotributo'). Fuente de verdad de qué módulos cubre cada persona.
- **`accesos_bloqueados`** — bloqueo manual de acceso por email

### Clientes y módulo Sueldos
- **`clientes`** — empresas; `liquidador_id` = asignación actual en Sueldos; `drive_folder_id` = raíz Drive
- **`servicios_cliente`** — cliente_id, servicio, subtipo, estado (bool), responsable_id. Qué servicios tiene activos cada cliente. Filtrar siempre por `estado=true`.
- **`periodos`** — mes/año de liquidación (ej: junio 2026); se crea automáticamente
- **`tareas`** — estado de cada cliente por período; una fila por (cliente, período)
  - `*_manual` = marcado por la liquidadora; `*_drive` = detectado por sync
  - `recibos_manual_en` / `f931_manual_en` = timestamp de cuando se marcó (desde jul 2026)
  - `drive_error` = código de error del último sync (`no-folder`, `no-sueldos`, `no-mes`, etc.)
  - `legajos_cantidad` = se copia automáticamente del mes anterior si no está seteado
- **`asignaciones`** — historial de cambios de liquidadora en Sueldos con fecha efectiva (`desde_anio`, `desde_mes`)
- **`asignaciones_servicio`** — análoga a `asignaciones` pero para Impuestos/Monotributo (genérica por servicio+subtipo). Ver `src/lib/asignacionesServicio.ts`.
- **`drive_log`** — archivos detectados por sync; se borra y recrea en cada sync
- **`alertas_postcierre`** — registra ediciones en períodos ya cerrados

### Módulo Contable
- **`balances`** — cliente_id, anio_fiscal, fecha_cierre, estado, avance (int 0–100), envio1/2/3 (bool), envio1_fecha/2_fecha/3_fecha, info_recibida, responsable_id, responsable2_id, estado_eecc, f855_estado, f899_estado, f713_estado, f657_estado, igj_presentacion, igj_tasa, observaciones
  - UNIQUE (cliente_id, anio_fiscal)
  - VTO Balance = fecha_cierre + 135 días; VTO F.855 = fecha_cierre + 160 días
  - Estados: `sin_asignar` | `asignado` | `en_proceso` | `finalizado` | `frenado`
  - Datos importados: 102 balances 2025, 100 balances 2026 (desde Excel ESTATUS BALANCES.xlsx)
  - Contable no usa `asignaciones_servicio` — cada fila de `balances` ya tiene `responsable_id`/`responsable2_id` editable directo

### Módulo Impuestos
- **`impuestos_tareas`** — cliente_id, subtipo ('iva'|'iibb'|'seh'), anio, mes, estado ('pendiente'|'presentado'), fecha_presentacion, pago_estado, observaciones

### Módulo Monotributo
- **`monotributo_tareas`** — cliente_id, anio, mes, cuota_estado ('pendiente'|'pagado'), cuota_fecha, recategorizacion ('no_corresponde'|'pendiente'|'realizada'), categoria, deuda_monto, deuda_aviso, deuda_aviso_fecha, observaciones
  - Meses de recategorización: **febrero (2) y agosto (8)**; vencimiento cuota: día 20 de cada mes

---

## Rutas del sistema

### Panel General y Equipo
| Ruta | Descripción |
|---|---|
| `/panel-general` | Tabla maestra por cliente con todos los módulos |
| `/equipo` | Padrón de personas, bloqueos de acceso (antes `/liquidadoras`) |

### Módulo Sueldos
| Ruta | Descripción |
|---|---|
| `/seguimiento` | Tabla de tareas mensuales por empresa |
| `/dashboard` | Avance por liquidadora + vencimientos F.931 |
| `/empresas` | ABM de clientes de Sueldos |
| `/vencimientos` | Calendario F.931 2026 |
| `/productividad` | KPIs (admin only) — ahora con tabs a la productividad de los otros 3 módulos, ver abajo |

### Módulo Impuestos (color azul)
| Ruta | Descripción |
|---|---|
| `/impuestos` | Seguimiento mensual IVA / IIBB / Seg. e Hig. |
| `/impuestos/dashboard` | Stats por subtipo, avance por responsable |
| `/impuestos/vencimientos` | Pendientes por subtipo con semáforo de urgencia |
| `/impuestos/equipo` | Cards por miembro con breakdown por subtipo |

### Módulo Contable (color verde/emerald)
| Ruta | Descripción |
|---|---|
| `/contable` | Seguimiento anual de balances |
| `/contable/dashboard` | Stats, avance por responsable, próximos VTO |
| `/contable/vencimientos` | VTO Balance y VTO F.855 con semáforo |
| `/contable/equipo` | Cards por miembro: finalizados, avance promedio |

### Módulo Monotributo (color ámbar)
| Ruta | Descripción |
|---|---|
| `/monotributo` | Seguimiento mensual de cuotas + recategorización |
| `/monotributo/dashboard` | Cuotas pagadas, recategorización, avance por responsable |
| `/monotributo/vencimientos` | Pendientes cuota, calendario anual día 20 |
| `/monotributo/equipo` | Cards por miembro: cuotas, recategorización, deuda |

---

## Arquitectura de tabs por módulo

Cada módulo (contable, impuestos, monotributo) tiene un `layout.tsx` que renderiza `<ModuleTabBar>` encima del contenido. El componente está en `src/components/ModuleTabBar.tsx` (client component, usa `usePathname()`).

Patrón de altura para que el scroll funcione dentro del tab:
```tsx
// layout.tsx del módulo
<div className="flex flex-col h-full">
  <ModuleTabBar tabs={TABS} accentColor="text-emerald-600" />
  <div className="flex-1 min-h-0 overflow-hidden">
    {children}
  </div>
</div>

// página con tabla scrolleable
<div className="flex flex-col h-full bg-gray-50">
  <div className="flex-1 min-h-0 overflow-y-auto">
    <div className="overflow-x-auto pb-2">
      <table className="w-full text-sm whitespace-nowrap">
```

---

## Lógica de períodos

`getMesTrabajoActual()` en `src/lib/vencimientos.ts`:
- Devuelve el **mes anterior** como mes activo
- Cambia al mes siguiente 2 días después del último vencimiento F.931 del mes anterior (terminación 9)
- Esto evita que el sistema cambie de mes a mitad de los vencimientos escalonados

`GRUPOS_CUIT` — 3 grupos con vencimientos F.931 escalonados:
- CUITs 0–3 → primer vencimiento del mes
- CUITs 4–6 → segundo vencimiento
- CUITs 7–9 → tercer y último vencimiento

---

## Drive sync

Archivo central: `src/lib/drive.ts`

**Dos funciones de matching distintas** — NO intercambiarlas:
- `matchesMesFolder(name, mes, anio)` — **estricto**, para nombres de carpetas. Cada palabra debe ser un token de mes/año válido. Evita falsos positivos como "CARGAS SOCIALES 07-26".
- `matchesMonth(name, mes, anio)` — **flexible**, para nombres de archivos. El token de mes puede aparecer entre otras palabras.

**Fallback para carpetas con estructura no estándar:**
- Si `drive_folder_id` está seteado y no se encuentra carpeta de año → scan de categorías (RECIBOS DE SUELDO, CARGAS SOCIALES, etc. como carpetas raíz)
- Si hay archivos directamente en la carpeta del mes sin nombre reconocido → si `matchesMonth` = true → clasificar como `recibos`

**Estructura esperada en Drive:**
```
[drive_folder_id] SUELDOS/
  └── 2026/
      └── 07/  (o JULIO, JULIO 2026, 07-26, etc.)
          ├── recibos julio.pdf
          └── F931 julio 2026.pdf
```

---

## Alertas F.931 por email

`src/lib/email.ts` — **3 emails por mes**, anclados al último vencimiento (CUITs 7-9):

| Trigger | Destinatarios | Contenido |
|---|---|---|
| 3 días antes | Liquidadoras | Aviso anticipado con fechas por grupo |
| 1 día después | Liquidadoras + Admin | Pendientes post-vencimiento |
| 5 días después | Solo Admin | Reporte final definitivo |

`FROM`: `bos@kmaconsultores.com.ar` (dominio propio verificado en Resend, agosto 2026).

---

## Cron jobs (GitHub Actions)

`.github/workflows/drive-sync.yml`:
- `activo-tanda-0` y `activo-tanda-1` → sync mes activo (2 tandas paralelas)
- `anterior-tanda-0` y `anterior-tanda-1` → sync mes anterior (solo 5 días post-cierre)
- `generar-reporte` → PDF del mes cerrado → email al admin

`.github/workflows/alertas-f931.yml`:
- Llama a `/api/alertas/f931` diariamente; el endpoint decide si corresponde enviar o no

Autenticación de los endpoints: header `Authorization: Bearer $CRON_SECRET`

---

## Variables de entorno

Todas deben estar en Vercel y en `.env.local` para desarrollo:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY       # bypassa RLS
GOOGLE_SERVICE_ACCOUNT_JSON     # JSON completo de la cuenta de servicio
CRON_SECRET                     # token para autenticar endpoints de cron
RESEND_API_KEY
ADMIN_EMAIL                     # giulianatignanelli15@gmail.com
```

---

## Migraciones SQL pendientes / aplicadas

Todas las migraciones están en `supabase/`. Para aplicar una: Supabase Dashboard → SQL Editor → pegar y correr.

Aplicadas en producción:
- `migration.sql` — schema inicial
- `rls_v2_control_acceso.sql` — políticas RLS por rol
- `alter_clientes_y_liquidadoras.sql` — claves_acceso jsonb, fecha_baja
- `alter_ficha_cliente.sql` — campos adicionales de ficha
- `add_recordatorio.sql` — columna tareas.recordatorio
- `add_asignaciones.sql` — tabla asignaciones (reasignación con fecha efectiva)
- `drive_error` en tareas — `ALTER TABLE tareas ADD COLUMN IF NOT EXISTS drive_error TEXT;`
- `add_lsd_desde.sql` — columnas `lsd_desde_anio` y `lsd_desde_mes` en clientes (tracking regularización LSD)
- `add_accesos_bloqueados.sql` — tabla accesos_bloqueados (bloqueo manual de modo consulta)
- `add_modulos_base_maestra.sql` — tablas equipo, equipo_modulos, servicios_cliente; FK equipo_id en liquidadoras; vista vista_empresas
- `update_vista_empresas.sql` — agrega sc.estado = true a vista_empresas para reflejar bajas de servicio
- `add_impuestos_tareas.sql` — tabla impuestos_tareas (seguimiento mensual IVA/IIBB/SEH)
- `add_balances.sql` — tabla balances (módulo Contable, seguimiento anual)
- `add_monotributo_tareas.sql` — tabla monotributo_tareas (categoría, cuota, recategorización cuatrimestral)
- `add_monotributo_deuda.sql` — columnas deuda_monto, deuda_aviso, deuda_aviso_fecha en monotributo_tareas
- `backfill_servicios_sueldos.sql` — backfill de `servicios_cliente(servicio='sueldos')`. Corrido 20-ago-2026 con criterio incorrecto — corregido enseguida con el siguiente.
- `fix_servicios_sueldos_liquidador.sql` — corrige el backfill: 86 clientes con Sueldos activo, 85 con `liquidador_id` (diferencia de 1 es válida).
- `add_asignaciones_servicio.sql` — tabla `asignaciones_servicio` (historial de reasignación para Impuestos/Monotributo, genérica por servicio+subtipo).
- `unificar_equipo.sql` — migra `equipo` a `liquidadoras` (mismos ids), repunta FKs, backfillea `equipo_modulos(modulo='sueldos')`, renombra `equipo` a `equipo_legacy`.
- `fix_equipo_modulos_sueldos.sql` — corrige backfill anterior: `con_area_sueldos` bajó de 33 a 9 (correcto).
- `cargar_seh_y_contable_ago2026.sql` — corrida por Giuliana el 24-ago vía Supabase SQL Editor (la sesión de Claude no tenía credenciales de escritura, ver nota en Contexto del cliente). Carga Seg. e Hig. para 22 clientes (desde `ESTATUS IMPUESTOS 2026.xlsx`, cruzado a mano contra `clientes`/`liquidadoras` reales) y completa el responsable de 10 clientes de Contable (desde `ESTATUS BALANCES .xlsx`). Los ~76 clientes de Contable que siguen sin responsable son balances 2026 todavía no cerrados — confirmado por Giuliana, no tocar.
- `altas_nuevas_ago2026.sql` — corrida por Giuliana el 24-ago. Da de alta 11 clientes que aparecían en los Excel ESTATUS pero no existían en `clientes`. De los otros 24 CUIT que no matcheaban al principio: 14 eran clientes inactivos (bien, no tocar), 10 eran el CUIT del representante en vez del de la empresa (correcto — se usa para entrar a ARCA), salvo `3 AES SA` que tenía un typo real, corregido en el Excel de origen. `FUNDACION PAN Y ARTE` y `PAN Y ARTE SRL` quedaron marcados con ⚠ en `observaciones` por nombre casi idéntico, sin confirmar todavía si son dos entidades o un duplicado.

---

## Estado del proyecto (agosto 2026)

### Completado
- ✅ Acceso magic link, seguimiento sueldos, Drive sync, alertas email (Fases 1–4)
- ✅ Reasignación de empresas con historial
- ✅ Productividad/KPIs (admin only)
- ✅ **Panel General** (`/panel-general`) — tabla maestra por cliente, alta con asignación de servicios y responsables
- ✅ **Módulo Impuestos** — seguimiento mensual IVA/IIBB/SEH, toggle declaración, fecha, pago/VEP
- ✅ **Módulo Contable** — seguimiento anual de balances, formularios 855/F899/F713/F657/IGJ, vencimientos calculados
- ✅ **Módulo Monotributo** — cuota mensual, recategorización feb/ago, deuda con alertas visuales
- ✅ Importación de balances 2025 y 2026 desde Excel
- ✅ Scrollbar horizontal en tablas de módulos
- ✅ Dashboard, Vencimientos y Equipo para los 3 módulos (tabs por módulo con `ModuleTabBar`)
- ✅ Reasignación de responsable en Impuestos y Monotributo (historial por período, `asignaciones_servicio`)
- ✅ Panel de equipo por módulo con filtrado (componente `EquipoModuloPanel.tsx`)
- ✅ Padrón único de personas: `equipo` unificado con `liquidadoras`; `/liquidadoras` → `/equipo`
- ✅ Fix: `/empresas` y `/seguimiento` filtran por `servicios_cliente(servicio='sueldos')` (antes mostraban todos los clientes)
- ✅ Emails con dominio propio: `FROM = bos@kmaconsultores.com.ar`
- ✅ Integración de los archivos ESTATUS (24-ago): Seg. e Hig. cargada para 22 clientes, responsable completado para 10 balances de Contable, 11 altas nuevas, 1 typo de CUIT corregido. Ver migraciones `cargar_seh_y_contable_ago2026.sql` / `altas_nuevas_ago2026.sql` arriba.
- ✅ **Dashboard de productividad por módulo** (24-ago) — `/productividad` ahora tiene tabs Sueldos/Impuestos/Contable/Monotributo (`src/components/ProductividadTabs.tsx`). Impuestos y Monotributo: mes a mes, responsable resuelto vía `asignaciones_servicio` cuando hay historial (igual que `/seguimiento`), si no el actual de `servicios_cliente`. Contable: año a año porque `balances` es anual — un balance cuenta para los dos responsables si tiene `responsable_id` y `responsable2_id`. "A tiempo"/"Tarde": Impuestos usa el mismo vencimiento aproximado por subtipo que `/impuestos/vencimientos` (día del mes siguiente); Monotributo, día 20 del mismo mes; Contable no tiene fecha de cierre real del balance en el schema, así que en su lugar marca "vencidos sin cerrar" (hoy > fecha_cierre + 135 días y no está Finalizado).

### Pendiente de funcionalidad
- ⬜ Panel General: edición inline de datos de empresa, gestión de activaciones de servicios, sección "Claves fiscales" (claves por módulo, visibles desde la ficha del cliente en cada módulo)
- ⬜ Sync bidireccional Panel General ↔ módulos
- ⬜ Alertas para módulos nuevos (hoy solo F.931 de Sueldos)
- ⬜ Ajustes de diseño/interfaz (al final, después de cerrar el modelo de datos)
- ⬜ Selector de mes en `/impuestos/dashboard` y `/impuestos/vencimientos` no anda — el `<select>` tiene un `onChange` vacío (`(e) => { void e; }`), no navega al cambiar de mes. Bug preexistente de Matías, no tocado en esta sesión por estar fuera de scope.

### Pendiente operativo
- ⬜ Configurar SMTP propio en Supabase Auth (hoy da 429 con varios logins seguidos). Ir a Supabase Dashboard → Authentication → Emails → Custom SMTP: host `smtp.resend.com`, port 465, user `resend`, password = RESEND_API_KEY, sender `bos@kmaconsultores.com.ar`.

---

## Backlog de UX (feedback de Giuliana, sin implementar)

- **Claves/accesos por módulo en la ficha maestra del cliente**: la ficha tiene que permitir cargar todas las claves del cliente (portales de Sueldos, Impuestos, etc.), etiquetadas por módulo. Una clave marcada "impuestos" tiene que aparecer en la ficha de ese cliente dentro del módulo Impuestos, no solo en la maestra.
- **Alertas por configurar**: falta definir alertas para módulos nuevos — cuáles, para quién, con qué disparador.
- **Ajustes de diseño/interfaz**: cambios visuales pendientes de precisar. Acordado que va al final, después de cerrar el modelo de datos y la paridad funcional entre módulos.

---

## Contexto del cliente

- **KMA Consultores** — estudio contable, Buenos Aires
- **Giuliana Tignanelli** — administradora técnica (Athena Systems, athenasystems.latam@gmail.com), contacto principal y dueña de los accesos
- **Matías Serapio** — operador técnico designado por KMA Consultores (matiasserapio@kmaconsultores.com.ar); mantiene el sistema en el día a día, hace cambios y resuelve problemas
- **Liquidadoras** — empleadas de KMA que usan el sistema diariamente
- **María de Los Ángeles** — liquidadora cuyas empresas tienen Drive en SharePoint con estructura de categorías (diferente al resto)
