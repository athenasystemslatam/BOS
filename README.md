# BOS — Baires Outsourcing System

Sistema interno de KMA Consultores para el seguimiento mensual de liquidaciones de sueldos.

**Producción:** https://bos-plum.vercel.app  
**Repositorio:** github.com/athenasystemslatam/BOS

---

## Qué hace el sistema

BOS permite que las liquidadoras registren el avance mensual de cada cliente (recibos, F.931, boleta sindical, etc.), recibe alertas automáticas por email antes de los vencimientos del F.931, sincroniza automáticamente con Google Drive para detectar archivos subidos, y genera un reporte PDF mensual con el resumen de cierre.

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
| @react-pdf/renderer | Generación de PDF | Renderizado server-side sin browser |

---

## Modelo de datos (Supabase)

### `liquidadoras`
Usuarios del sistema (liquidadoras y admins).

| Campo | Tipo | Descripción |
|---|---|---|
| id | uuid | PK |
| nombre | text | Nombre completo |
| email | text | Email para alertas y magic link |
| rol | text | `admin` o `liquidadora` |
| activa | boolean | Si puede ingresar al sistema |
| user_id | uuid | FK → auth.users (Supabase Auth) |

### `clientes`
Empresas, monotributistas e inscriptos con liquidación de sueldos.

| Campo | Tipo | Descripción |
|---|---|---|
| id | uuid | PK |
| nombre | text | Nombre del cliente |
| cuit | text | 11 dígitos sin guiones |
| terminacion_cuit | int | Último dígito del CUIT (define fecha F.931) |
| liquidador_id | uuid | FK → liquidadoras (asignación actual) |
| tipo_contribuyente | text | `empresa`, `monotributista`, `inscripto` |
| es_quincenal | boolean | Tiene liquidación quincenal (rec_q1) |
| tiene_sindicato | boolean | Requiere boleta sindical |
| tiene_rubrica_lsd | boolean | Requiere rúbrica LSD |
| drive_folder_id | text | ID de la carpeta raíz en Google Drive |
| claves_acceso | jsonb | Array de `{sistema, usuario, contrasena, url}` |
| estado | text | `activo` o `inactivo` |

### `periodos`
Cada mes de liquidación (se crea automáticamente al abrir seguimiento).

| Campo | Tipo | Descripción |
|---|---|---|
| id | uuid | PK |
| anio | int | Año (ej: 2026) |
| mes | int | Mes 1-12 |
| nombre_mes | text | Ej: "Julio 2026" |

### `tareas`
Estado de cada cliente en cada período. Una fila por combinación cliente+período.

| Campo | Tipo | Descripción |
|---|---|---|
| cliente_id | uuid | FK → clientes |
| periodo_id | uuid | FK → periodos |
| recibos / f931 / rec_q1 / bol_sind / rub_lsd / sac | boolean | Estado consolidado (manual OR drive) |
| recibos_manual / f931_manual / etc. | boolean | Marcado manualmente por la liquidadora |
| recibos_drive / f931_drive / etc. | boolean | Detectado automáticamente por Drive sync |
| recibos_manual_en / f931_manual_en | timestamptz | Cuándo se marcó manualmente (desde julio 2026) |
| legajos_cantidad | int | Cantidad de legajos (se transfiere al período siguiente) |
| observaciones | text | Nota libre por empresa |
| recordatorio | text | Nota que aparece como alerta en el mes siguiente |

### `asignaciones`
Historial de cambios de liquidadora por cliente (con fecha efectiva).

| Campo | Tipo | Descripción |
|---|---|---|
| cliente_id | uuid | FK → clientes |
| liquidador_id | uuid | FK → liquidadoras |
| desde_anio / desde_mes | int | Período a partir del cual rige esta asignación |
| creado_por | uuid | FK → liquidadoras (quién hizo el cambio) |
| motivo | text | Razón del cambio (opcional) |

### `drive_log`
Archivos detectados en Drive por el sync automático.

| Campo | Tipo | Descripción |
|---|---|---|
| cliente_id | uuid | FK → clientes |
| periodo_id | uuid | FK → periodos |
| archivo_nombre | text | Nombre del archivo en Drive |
| archivo_url | text | Link directo al archivo |
| tarea_detectada | text | Campo que representa (f931, recibos, etc.) |

### `alertas_postcierre`
Registro cuando se modifica un checkbox en un período ya cerrado.

---

## Decisiones de arquitectura

**¿Por qué el mes de trabajo es el mes anterior?**  
Los sueldos de junio se liquidan y presentan en julio. El sistema trabaja con el "mes anterior al actual" como mes activo, hasta 2 días después del último vencimiento F.931 de ese mes (terminación 9), momento en que cambia al mes siguiente. Esto evita que el sistema cambie de mes a mitad de los vencimientos.

**¿Por qué GitHub Actions para el cron y no Vercel Cron?**  
Vercel Hobby limita las funciones serverless a 10 segundos. El Drive sync (42 clientes, múltiples llamadas a la API de Google) supera ese límite. GitHub Actions llama al endpoint de Vercel como cliente HTTP externo, sin límite de tiempo propio.

**¿Por qué `createAdminClient()` en vez del cliente normal?**  
Supabase tiene Row Level Security (RLS) activado. Para operaciones del sistema (crear períodos, sync de Drive, reportes) se necesita bypassear RLS. `createAdminClient()` usa la `SUPABASE_SERVICE_ROLE_KEY` (clave de servicio) que ignora RLS. Las operaciones de usuario usan el cliente normal con la sesión del usuario.

**¿Por qué la cuenta de servicio de Google solo puede leer carpetas y no subir archivos?**  
Las cuentas de servicio no tienen cuota de almacenamiento de Google Drive. Pueden leer sin problema, pero no pueden crear archivos en Drive personal. Para subir el reporte PDF se usa email (Resend) en su lugar.

---

## Variables de entorno

Todas deben estar en Vercel (Settings → Environment Variables) y en `.env.local` para desarrollo:

```
NEXT_PUBLIC_SUPABASE_URL        # URL del proyecto Supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY   # Clave anon (pública)
SUPABASE_SERVICE_ROLE_KEY       # Clave de servicio (privada, bypasses RLS)
GOOGLE_SERVICE_ACCOUNT_JSON     # JSON completo de la cuenta de servicio de Google
CRON_SECRET                     # Token para autenticar los endpoints de cron
RESEND_API_KEY                  # API key de Resend para emails
ADMIN_EMAIL                     # Email del admin (recibe alertas y reportes)
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

| Rol | Qué ve | Qué puede hacer |
|---|---|---|
| `liquidadora` | Solo sus empresas asignadas | Marcar checkboxes, agregar observaciones y recordatorios |
| `admin` | Todas las empresas | Todo lo anterior + crear/editar empresas, reasignar liquidadoras, ver productividad, ver todas las liquidadoras |

El campo `rol` en la tabla `liquidadoras` controla el acceso. Athena Systems (la administradora técnica) tiene `rol = admin` pero sin clientes asignados, por lo que no aparece en los selectores de liquidadora del sistema.

---

## Flujos automáticos

### Drive Sync (diario, 6am Argentina)
GitHub Actions corre el workflow `drive-sync.yml` con 4 jobs secuenciales:
1. `activo-tanda-0` y `activo-tanda-1`: sync del mes activo (todos los clientes en 2 tandas)
2. `anterior-tanda-0` y `anterior-tanda-1`: sync del mes anterior (solo durante los 5 días post-cierre del F.931)
3. `generar-reporte`: genera PDF del mes anterior y lo envía por email

El sync llama a `/api/cron/drive-sync` con `?tanda=X&total=2&mes=activo|anterior`.

### Alertas F.931
El endpoint `/api/alertas/f931` se llama por cron (GitHub Actions o Vercel Cron). Envía emails a las liquidadoras cuando sus empresas tienen F.931 pendiente a 7, 3 o 0 días del vencimiento. El admin recibe copia en los últimos 3 días.

### Reporte mensual PDF
El endpoint `/api/cron/reporte-mensual` genera un PDF con estadísticas del mes cerrado (avance por liquidadora, empresas pendientes) y lo envía por email al admin.

---

## Manual para liquidadoras

### Acceso
1. Pedirle al admin que te envíe el link de acceso
2. Revisar el email y hacer click en el link (expira en 1 hora)
3. El sistema recuerda la sesión; no es necesario ingresar todos los días

### Seguimiento mensual
La pantalla principal es **Seguimiento**. Muestra todas tus empresas ordenadas por terminación de CUIT (que coincide con el orden de vencimiento del F.931).

**Columnas:**
- **Rec Q1**: recibos primera quincena (solo empresas quincenales)
- **Recibos**: recibos de sueldos
- **F.931**: presentación de cargas sociales
- **Bol. sind.**: boleta sindical (solo empresas con sindicato)
- **Rúb. LSD**: rúbrica libro de sueldos (solo empresas que lo requieren)
- **SAC**: aguinaldo (junio y diciembre)

**Cómo usar:**
- Tildá cada tarea cuando esté completa
- Si Drive detectó el archivo automáticamente, el checkbox aparece marcado con fondo celeste (no lo marcaste vos, lo encontró el sistema)
- Podés escribir observaciones en el campo de notas de cada empresa
- El campo "→ Sig. mes" sirve para dejar un recordatorio que va a aparecer en el próximo período

### Llave de claves
El ícono de llave al lado de cada empresa abre las claves de acceso (AFIP, sistema de sueldos, etc.). Hacé click en el ícono de copiar para copiar al portapapeles.

### Navegación por período
Usá el selector de mes en la parte superior para ver períodos anteriores. El sistema muestra automáticamente el mes de trabajo actual.

---

## Contacto técnico

Sistema desarrollado por Athena Systems (athenasystems.latam@gmail.com).  
Para cambios en el sistema, accesos o configuración, contactar a Athena Systems.
