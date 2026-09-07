# BOS — Baires Outsourcing System

Sistema interno de KMA Consultores para el seguimiento de clientes por módulo: Sueldos, Impuestos, Contable y Monotributo, más una vista general (Panel General) y gestión de equipo. El módulo de **Sueldos está prácticamente completo**; los demás (Impuestos, Contable, Monotributo) están en desarrollo activo.

**Producción:** https://bos-plum.vercel.app  
**Repositorio:** github.com/athenasystemslatam/BOS

---

## Qué hace el sistema

BOS centraliza el seguimiento mensual de los clientes de la consultora. En **Sueldos**, las liquidadoras registran el avance de cada empresa (recibos, F.931, boleta sindical, rúbrica LSD, SAC), reciben alertas automáticas por email antes de los vencimientos del F.931, el sistema sincroniza con Google Drive para detectar archivos ya subidos, y se genera un reporte PDF mensual con el resumen de cierre. **Panel General** da una vista de todos los clientes con sus responsables en cada módulo, para dar de alta o editar una empresa sin importar qué áreas contrate. **Equipo** gestiona altas/bajas de personas y bloqueo de accesos.

---

## Módulos

| Ruta | Qué es | Estado |
|---|---|---|
| `/seguimiento` | Seguimiento mensual de Sueldos (checkboxes por tarea, legajos, alícuota ART, observaciones, recordatorios) | Completo |
| `/empresas` | Alta/edición de clientes de Sueldos, historial de reasignación de liquidadora | Completo |
| `/vencimientos` | Calendario de vencimientos F.931 por grupo de CUIT | Completo |
| `/panel-general` | Vista de todos los clientes con responsable por módulo (Sueldos/Impuestos/Contable/Monotributo/Libros); alta, edición y exportación a Excel de clientes multi-módulo | Completo |
| `/equipo` | Padrón de personas, qué módulos cubre cada una, bloqueo de accesos | Completo |
| `/impuestos` | Seguimiento mensual por subtipo (IVA, IIBB, Seg. e Hig.) | En desarrollo |
| `/contable` | Balances anuales (envíos de info, EECC, F.855/899/713/657, IGJ) | En desarrollo |
| `/monotributo` | Cuota mensual y recategorización cuatrimestral | En desarrollo |
| `/dashboard`, `/productividad` | Estadísticas de avance por liquidadora/módulo | Parcial |

Impuestos, Contable y Monotributo repiten el mismo patrón interno: `[modulo]/page.tsx` + `[modulo]Client.tsx`, con `/[modulo]/dashboard`, `/[modulo]/equipo` y `/[modulo]/vencimientos` propios.

---

## Stack tecnológico

| Tecnología | Rol | Por qué |
|---|---|---|
| Next.js 14 (App Router) | Frontend + backend | Server Components permiten queries directas a Supabase sin API intermedia |
| Supabase | Base de datos + autenticación | PostgreSQL gestionado, RLS nativo, magic link sin configuración de sesiones |
| Vercel | Hosting | Deploy automático desde GitHub, integrado con Next.js |
| Google Drive API | Detección de archivos | Las liquidadoras ya trabajan en Drive; el sistema lee sin mover nada |
| Resend | Emails | API simple, sin configurar servidor SMTP |
| GitHub Actions | Cron jobs | Vercel Hobby tiene límite de 10s por función; GitHub Actions llama al endpoint y espera sin límite |
| @react-pdf/renderer | Generación de PDF | Renderizado server-side sin browser (reporte mensual) |
| exceljs | Generación de Excel | Usada en `/api/exportar/clientes` — genera el archivo en el servidor, sin guardarlo |

---

## Modelo de datos (Supabase)

### `liquidadoras`
Usuarios del sistema con acceso a Sueldos (y, si `rol = admin`, a todo).

| Campo | Tipo | Descripción |
|---|---|---|
| id | uuid | PK |
| nombre | text | Nombre completo |
| email | text | Email para alertas y magic link |
| rol | text | `admin`, `supervisor`, `liquidadora` o `viewer` |
| activa | boolean | Si puede ingresar al sistema |
| user_id | uuid | FK → auth.users (Supabase Auth) |
| equipo_id | uuid | FK → `equipo` (opcional, vincula con el padrón general) |

### `equipo`
Padrón general de personal de KMA (más amplio que `liquidadoras`: cubre también gente de Impuestos/Contable/Monotributo que no liquida sueldos).

| Campo | Tipo | Descripción |
|---|---|---|
| id | uuid | PK |
| nombre | text | Nombre completo |
| activo | boolean | Si sigue en el equipo |

### `equipo_modulos`
Qué módulos cubre cada persona del equipo (una fila por módulo asignado).

| Campo | Tipo | Descripción |
|---|---|---|
| equipo_id | uuid | FK → `equipo` |
| modulo | text | `sueldos`, `impuestos`, `contable`, `monotributo` |

### `clientes`
Empresas, monotributistas e inscriptos — ficha maestra, un solo registro por cliente sin importar cuántos módulos contrate.

| Campo | Tipo | Descripción |
|---|---|---|
| id | uuid | PK |
| nombre | text | Nombre del cliente |
| cuit | text | 11 dígitos sin guiones, `UNIQUE` |
| terminacion_cuit | int | Último dígito del CUIT (define fecha F.931) |
| tipo_contribuyente | text | `empresa`, `monotributista`, `inscripto` |
| liquidador_id | uuid | FK → liquidadoras (responsable de Sueldos vigente) |
| emails_contacto | text[] | Hasta 5 emails de contacto (validado en front y en el server) |
| cuil_arca | text | CUIL usado para entrar a ARCA |
| es_quincenal | boolean | Tiene liquidación quincenal (rec_q1) |
| tiene_sindicato / sindicato_nombre | boolean / text | Requiere boleta sindical |
| tiene_rubrica_lsd / jurisdiccion | boolean / text | Requiere rúbrica LSD (CABA o PBA) |
| lsd_desde_anio/mes, lsd_hasta_anio/mes | int | Rango de regularización de la rúbrica |
| art | text | Aseguradora de riesgos del trabajo |
| alicuota_art | text | Alícuota contratada — se edita directo desde Seguimiento |
| red_bancaria | text | Banco/red de pago de sueldos |
| fecha_alta_empleador | date | Fecha de alta como empleador |
| drive_folder_id | text | ID de la carpeta raíz en Google Drive |
| claves_acceso | jsonb | Array de `{sistema, usuario, contrasena, modulo?}` — sin URL (se sacó, ver Decisiones) |
| observaciones | text | Nota libre de la ficha |
| estado | text | `activo` o `inactivo` (no hay borrado real, solo baja) |

### `servicios_cliente`
Qué módulos/subtipos tiene contratado cada cliente y quién es responsable — de acá lee Panel General.

| Campo | Tipo | Descripción |
|---|---|---|
| cliente_id | uuid | FK → clientes |
| servicio | text | `sueldos`, `impuestos`, `contable`, `monotributo`, `libros` |
| subtipo | text | `general`, o `iva`/`iibb`/`seh` dentro de impuestos |
| responsable_id | uuid | FK → equipo |
| estado | boolean | Activo/inactivo (baja sin borrar), `UNIQUE (cliente_id, servicio, subtipo)` |

### `vista_empresas` (view)
Una fila por cliente con el nombre del responsable ya resuelto por cada servicio/subtipo (no ids) — es lo que lee Panel General. Se recrea entera cada vez que cambia (no admite `ALTER`/rename de columnas).

### `periodos`
Cada mes de liquidación de Sueldos (se crea automáticamente al abrir seguimiento).

| Campo | Tipo | Descripción |
|---|---|---|
| id | uuid | PK |
| anio | int | Año (ej: 2026) |
| mes | int | Mes 1-12 |
| nombre_mes | text | Ej: "Julio 2026" |

### `tareas`
Estado de cada cliente de Sueldos en cada período. Una fila por combinación cliente+período.

| Campo | Tipo | Descripción |
|---|---|---|
| cliente_id | uuid | FK → clientes |
| periodo_id | uuid | FK → periodos |
| recibos / f931 / rec_q1 / bol_sind / rub_lsd / sac | boolean | Estado consolidado (manual OR drive) |
| recibos_manual / f931_manual / etc. | boolean | Marcado manualmente por la liquidadora |
| recibos_drive / f931_drive / etc. | boolean | Detectado automáticamente por Drive sync |
| recibos_manual_en / f931_manual_en | timestamptz | Cuándo se marcó manualmente (desde julio 2026) |
| legajos_cantidad | int | Cantidad de legajos (se transfiere al período siguiente) |
| observaciones | text | Nota libre por empresa y período |
| recordatorio | text | Nota que aparece como alerta en el mes siguiente |

### `asignaciones`
Historial de cambios de liquidadora de Sueldos por cliente (con fecha efectiva).

| Campo | Tipo | Descripción |
|---|---|---|
| cliente_id | uuid | FK → clientes |
| liquidador_id | uuid | FK → liquidadoras |
| desde_anio / desde_mes | int | Período a partir del cual rige esta asignación |
| creado_por | uuid | FK → liquidadoras (quién hizo el cambio) |
| motivo | text | Razón del cambio (opcional) |

### `asignaciones_servicio`
Mismo historial que `asignaciones`, generalizado para Impuestos y Monotributo (Contable no lo necesita — resuelve el responsable directo en cada fila de `balances`).

| Campo | Tipo | Descripción |
|---|---|---|
| cliente_id, servicio, subtipo | uuid, text, text | Qué módulo/subtipo se reasigna |
| responsable_id | uuid | FK → equipo |
| desde_anio / desde_mes | int | Período a partir del cual rige |
| `UNIQUE (cliente_id, servicio, subtipo, desde_anio, desde_mes)` | | |

### `impuestos_tareas`
Seguimiento mensual del módulo Impuestos, por subtipo.

| Campo | Tipo | Descripción |
|---|---|---|
| cliente_id, subtipo, anio, mes | | `subtipo` = `iva`/`iibb`/`seh`, `UNIQUE` por los cuatro |
| estado | text | `pendiente` / `presentado` |
| pago_estado | text | `pendiente`/`pago`/`saldo_a_favor`/`enviado`/`diferido`/`boleta` |

### `monotributo_tareas`
Seguimiento mensual del módulo Monotributo.

| Campo | Tipo | Descripción |
|---|---|---|
| cliente_id, anio, mes | | `UNIQUE (cliente_id, anio, mes)` |
| cuota_estado | text | `pendiente` / `pagado` |
| recategorizacion | text | `no_corresponde`/`pendiente`/`realizada` (solo ene/may/sep) |
| categoria | text | A a K |

### `balances`
Balance anual del módulo Contable — un registro por cliente y año fiscal.

| Campo | Tipo | Descripción |
|---|---|---|
| cliente_id, anio_fiscal | | `UNIQUE (cliente_id, anio_fiscal)` |
| responsable_id, responsable2_id | uuid | Hasta 2 responsables (FK → equipo) |
| estado, avance | text, int | Estado general y % de avance |
| envio1/2/3 (+fecha), info_recibida | boolean/date | Pedido de información al cliente |
| estado_eecc, f855/f899/f713/f657_estado, igj_presentacion, igj_tasa | text | Trámites de cierre (vencimientos calculados en la app, no en la base) |

### `drive_log`
Archivos detectados en Drive por el sync automático de Sueldos.

| Campo | Tipo | Descripción |
|---|---|---|
| cliente_id | uuid | FK → clientes |
| periodo_id | uuid | FK → periodos |
| archivo_nombre | text | Nombre del archivo en Drive |
| archivo_url | text | Link directo al archivo |
| tarea_detectada | text | Campo que representa (f931, recibos, etc.) |

### `alertas_postcierre`
Registro cuando se modifica un checkbox de Sueldos en un período ya cerrado.

### `accesos_bloqueados`
Emails a los que se les cortó el acceso manualmente (aunque sean del dominio permitido).

| Campo | Tipo | Descripción |
|---|---|---|
| email | text | PK |
| motivo | text | Por qué se bloqueó (opcional) |
| bloqueado_por | text | Quién lo bloqueó |
| bloqueado_en | timestamptz | Cuándo |

---

## Decisiones de arquitectura

**¿Por qué el mes de trabajo es el mes anterior?**  
Los sueldos de junio se liquidan y presentan en julio. El sistema trabaja con el "mes anterior al actual" como mes activo, hasta 2 días después del último vencimiento F.931 de ese mes (terminación 9), momento en que cambia al mes siguiente. Esto evita que el sistema cambie de mes a mitad de los vencimientos.

**¿Por qué GitHub Actions para el cron y no Vercel Cron?**  
Vercel Hobby limita las funciones serverless a 10 segundos. El Drive sync (decenas de clientes, múltiples llamadas a la API de Google) supera ese límite. GitHub Actions llama al endpoint de Vercel como cliente HTTP externo, sin límite de tiempo propio.

**¿Por qué `createAdminClient()` en vez del cliente normal?**  
Supabase tiene Row Level Security (RLS) activado, pero el control de acceso real (admin vs. liquidadora vs. solo-lectura) se resuelve en código de aplicación, no en políticas RLS. Para operaciones del sistema (crear períodos, sync de Drive, reportes, y prácticamente todas las Server Actions) se usa `createAdminClient()`, que usa la `SUPABASE_SERVICE_ROLE_KEY` y bypassea RLS. Justamente por eso cada Server Action de escritura debe chequear el rol a mano (`requireAdmin()` / `requireLiquidadoraOrAdmin()`), y nunca se expone esta clave al navegador.

**¿Por qué no hay forma de borrar un cliente de verdad?**  
Solo existe "dar de baja" (`estado: inactivo`), nunca un `delete`. Un cliente inactivo sigue ocupando su CUIT (columna `UNIQUE`), así que un duplicado mal cargado no se libera solo desactivándolo — hay que corregirlo o borrarlo a mano en Supabase. Es una decisión deliberada: mejor un duplicado visible que un borrado accidental sin vuelta atrás.

**¿Por qué la cuenta de servicio de Google solo puede leer carpetas y no subir archivos?**  
Las cuentas de servicio no tienen cuota de almacenamiento de Google Drive. Pueden leer sin problema, pero no pueden crear archivos en Drive personal. Para el reporte PDF mensual se usa email (Resend) en su lugar.

**¿Por qué la exportación a Excel incluye las contraseñas de las claves de acceso en texto plano?**  
Fue una decisión explícita del usuario (no el default recomendado) al pedir la funcionalidad. El archivo que genera `/api/exportar/clientes` es tan sensible como los sistemas que lista — quien lo reciba por mail o lo guarde en una compu tiene acceso directo a esas claves. Solo admins pueden generarlo (`requireAdmin()`).

---

## Variables de entorno

Todas deben estar en Vercel (Settings → Environment Variables) y en `.env.local` para desarrollo:

```
NEXT_PUBLIC_SUPABASE_URL        # URL del proyecto Supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY   # Clave anon (pública)
SUPABASE_SERVICE_ROLE_KEY       # Clave de servicio (privada, bypasses RLS)
GOOGLE_SERVICE_ACCOUNT_JSON     # JSON completo de la cuenta de servicio de Google
                                 # (alternativa para dev local: GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY)
CRON_SECRET                     # Token para autenticar los endpoints de cron
RESEND_API_KEY                  # API key de Resend para emails
ADMIN_EMAIL                     # Email del admin (recibe alertas y reportes)
NEXT_PUBLIC_SITE_URL            # Opcional — base para links de invitación; si falta usa VERCEL_URL
```

---

## Cómo levantar en local

```bash
# 1. Clonar el repo
git clone github.com/athenasystemslatam/BOS
cd BOS

# 2. Instalar dependencias
npm install

# 3. Crear .env.local con las variables de entorno (ver sección anterior)

# 4. Correr en desarrollo
npm run dev
# Disponible en http://localhost:3000
```

El acceso es por **magic link**: el sistema envía un email con un link de un solo uso. No hay contraseñas.

---

## Roles y acceso

| Nivel | Qué ve | Qué puede hacer |
|---|---|---|
| **Consulta** | Cualquier email del dominio permitido sin fila en `liquidadoras` | Solo lectura. Único write habilitado: agregar observaciones en Seguimiento |
| **Liquidadora** | Solo sus empresas asignadas | Marcar checkboxes, cargar legajos/alícuota ART, observaciones y recordatorios |
| **Admin** | Todas las empresas, todos los módulos | Todo lo anterior + crear/editar clientes, reasignar responsables, ver equipo y productividad |

El campo `rol` en `liquidadoras` admite además `supervisor` y `viewer` (ver `/equipo`), pero el corte grueso de permisos en la app hoy es admin vs. no-admin. El control de acceso (incluido el bloqueo de emails) se resuelve en `middleware.ts` + `src/lib/auth.ts` en cada request, no en RLS.

---

## Flujos automáticos

### Drive Sync (diario, 6am Argentina)
GitHub Actions corre el workflow `drive-sync.yml` con 5 jobs secuenciales:
1. `activo-tanda-0` y `activo-tanda-1`: sync del mes activo (todos los clientes en 2 tandas)
2. `anterior-tanda-0` y `anterior-tanda-1`: sync del mes anterior (solo durante los días post-cierre del F.931)
3. `generar-reporte`: genera PDF del mes anterior y lo envía por email

El sync llama a `/api/cron/drive-sync` con `?tanda=X&total=2&mes=activo|anterior`.

### Alertas F.931
El endpoint `/api/alertas/f931` se llama por cron. Envía emails a las liquidadoras cuando sus empresas tienen F.931 pendiente a 7, 3 o 0 días del vencimiento. El admin recibe copia en los últimos 3 días.

### Reporte mensual PDF
El endpoint `/api/cron/reporte-mensual` genera un PDF con estadísticas del mes cerrado (avance por liquidadora, empresas pendientes) y lo envía por email al admin.

---

## Exportación de datos

`GET /api/exportar/clientes` (solo admin) genera un Excel al vuelo, sin guardarlo en ningún lado:

- Sin `?id` → todos los clientes.
- Con `?id=<uuid>` → un solo cliente (botón de descarga por fila en Panel General).

El archivo tiene dos hojas: **Clientes** (una fila por empresa, todos los campos de la ficha) y **Claves de acceso** (una fila por sistema cargado, contraseña incluida — ver Decisiones de arquitectura). Todavía no hay un backup automático periódico armado con esto; por ahora es solo a demanda, desde el botón "Exportar todo" de Panel General.

---

## Manuales de uso

Este README es la referencia técnica/arquitectura. Para el paso a paso operativo hay dos manuales aparte (para no duplicar contenido en dos lugares que se puedan desactualizar distinto):

- **[MANUAL_LIQUIDADORAS.md](MANUAL_LIQUIDADORAS.md)** — cómo ingresar y usar Seguimiento día a día, pensado para quien liquida sueldos.
- **[MANUAL_OPERADOR.md](MANUAL_OPERADOR.md)** — cómo mantener/modificar el sistema (accesos a GitHub/Vercel/Supabase, cómo aplicar una migración SQL, cómo desplegar), pensado para quien administra BOS sin ser programador.

---

## Contacto técnico

Sistema desarrollado por Athena Systems (athenasystems.latam@gmail.com).  
Para cambios en el sistema, accesos o configuración, contactar a Athena Systems.
