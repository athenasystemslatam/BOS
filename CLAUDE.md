# BOS — Contexto para Claude Code

Sistema interno de KMA Consultores para seguimiento mensual de liquidaciones de sueldos.

**Producción:** https://bos-plum.vercel.app  
**Repo:** github.com/athenasystemslatam/BOS  
**Deploy:** Vercel, auto-deploy desde `main`. Cada push a main va directo a producción.

---

## Reglas de trabajo

- **SIEMPRE avisar antes de `git push`, borrar archivos, o cualquier cambio que afecte producción.** Esperar confirmación explícita. El usuario dice "pushea" o "dale" para aprobar.
- No crear archivos de documentación extra a menos que se pida explícitamente.
- No agregar comentarios al código salvo que el WHY sea no obvio.
- No refactorizar código que no está en scope del pedido.

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

## Modelo de datos clave

- **`liquidadoras`** — usuarios del sistema (`rol`: `admin` | `liquidadora` | `supervisor`)
- **`clientes`** — empresas; `liquidador_id` = asignación actual; `drive_folder_id` = raíz Drive
- **`periodos`** — mes/año de liquidación (ej: junio 2026); se crea automáticamente
- **`tareas`** — estado de cada cliente por período; una fila por (cliente, período)
  - `*_manual` = marcado por la liquidadora; `*_drive` = detectado por sync
  - `recibos_manual_en` / `f931_manual_en` = timestamp de cuando se marcó (desde jul 2026)
  - `drive_error` = código de error del último sync (`no-folder`, `no-sueldos`, `no-mes`, etc.)
  - `legajos_cantidad` = se copia automáticamente del mes anterior si no está seteado
- **`asignaciones`** — historial de cambios de liquidadora con fecha efectiva (`desde_anio`, `desde_mes`)
- **`drive_log`** — archivos detectados por sync; se borra y recrea en cada sync
- **`alertas_postcierre`** — registra ediciones en períodos ya cerrados

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

`FROM` actual: `onboarding@resend.dev` (modo prueba Resend). Cuando se configure el dominio propio, cambiar solo la constante `FROM` en `email.ts`.

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

---

## Estado del proyecto (julio 2026)

- **Fase 1–4** completas: acceso magic link, seguimiento, Drive sync, alertas email
- **Fase 5** en curso:
  - ✅ Reasignación de empresas (`/empresas` → ícono historial, admin only)
  - ✅ Productividad/KPIs (`/productividad`, admin only, desde junio 2026)
  - ⬜ README/documentación técnica
- **Pendiente operativo**: configurar dominio propio en Resend para que los emails lleguen a las liquidadoras (hoy solo llegan al admin)
- **Pendiente operativo**: configurar SMTP propio (Resend) en Supabase Auth para los emails de login/invitación. Hoy usan el servicio compartido de Supabase, que tiene un límite bajo de envíos por hora (HTTP 429 en `/auth/v1/otp` si hay varios logins/invitaciones seguidos). Depende del punto anterior (dominio verificado en Resend) para poder mandar a cualquier destinatario, no solo al admin.

---

## Contexto del cliente

- **KMA Consultores** — estudio contable, Buenos Aires
- **Giuliana Tignanelli** — administradora técnica (Athena Systems, athenasystems.latam@gmail.com), contacto principal y dueña de los accesos
- **Matías Serapio** — operador técnico designado por KMA Consultores (matiasserapio@kmaconsultores.com.ar); mantiene el sistema en el día a día, hace cambios y resuelve problemas
- **Liquidadoras** — empleadas de KMA que usan el sistema diariamente
- **María de Los Ángeles** — liquidadora cuyas empresas tienen Drive en SharePoint con estructura de categorías (diferente al resto)
