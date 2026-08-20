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

## Control de accesos (desde agosto 2026)

Tres niveles, todo resuelto en `middleware.ts` + `src/lib/auth.ts` (no en RLS, mismo criterio que el resto):

- **Consulta**: cualquier email `@kmaconsultores.com.ar` sin fila en `liquidadoras` entra en modo solo-lectura. Único write permitido: `updateObservaciones` en `seguimiento/actions.ts` (a propósito sin `requireLiquidadoraOrAdmin`).
- **Liquidadora/Admin**: fila en `liquidadoras` con `user_id` vinculado. Se da de alta desde `/liquidadoras` (`crearLiquidadora` en `liquidadoras/actions.ts`), no requiere tocar Supabase a mano. El rol determina `isAdmin`.
- **Bloqueo**: tabla `accesos_bloqueados` (email, motivo, bloqueado_por, bloqueado_en). Gestionada desde `/liquidadoras` → `BloqueosPanel.tsx` → `bloquearAcceso`/`desbloquearAcceso` en `liquidadoras/actions.ts`.

`middleware.ts` chequea en **cada request** (no solo al loguearse): si el mail está en `accesos_bloqueados` → `signOut()` + redirect. Si el mail no es del dominio Y no tiene fila en `liquidadoras` → mismo corte. Esto es lo que permite cortar sesiones ya abiertas (Supabase Auth no expira sesiones solo — el refresh token se renueva indefinidamente si no se corta a mano).

`getCurrentLiquidadora()` en `lib/auth.ts` respeta `activa: false` — una liquidadora/admin dada de baja (`editarLiquidadora` con `activa: false`) pierde el rol en el siguiente request, sin necesidad de tocar Supabase Auth.

Dominio permitido centralizado en `src/lib/dominio.ts` (sin imports, para ser válido tanto en el runtime Edge de `middleware.ts` como en Node).

`requireLiquidadoraOrAdmin()` (nuevo, en `lib/auth.ts`) gatea las Server Actions de escritura de seguimiento (`toggleManual`, `updateLegajos`, `updateRecordatorio`, `syncDrive`). `crearEmpresa` en `empresas/actions.ts` no tenía `requireAdmin()` — se agregó (gap preexistente).

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
- `add_accesos_bloqueados.sql` — tabla accesos_bloqueados (bloqueo manual de modo consulta)
- `add_modulos_base_maestra.sql` — tablas equipo, equipo_modulos, servicios_cliente; FK equipo_id en liquidadoras; vista vista_empresas
- `update_vista_empresas.sql` — agrega sc.estado = true a vista_empresas para reflejar bajas de servicio
- `add_impuestos_tareas.sql` — tabla impuestos_tareas (seguimiento mensual IVA/IIBB/SEH)
- `add_balances.sql` — tabla balances (módulo Contable, seguimiento anual)
- `add_monotributo_tareas.sql` — tabla monotributo_tareas (categoría, cuota, recategorización cuatrimestral)
- `add_monotributo_deuda.sql` — columnas deuda_monto, deuda_aviso, deuda_aviso_fecha en monotributo_tareas
- `backfill_servicios_sueldos.sql` — backfill de `servicios_cliente(servicio='sueldos')` para clientes sin ninguna fila todavía. Corrido en producción 20-ago-2026 con criterio incorrecto (ver nota en el archivo) — corregido enseguida con `fix_servicios_sueldos_liquidador.sql`.
- `fix_servicios_sueldos_liquidador.sql` — corrige el backfill anterior: deshace el tag de "sueldos" en los clientes sin `liquidador_id` (no eran de Sueldos) y lo agrega en 2 clientes que sí tenían liquidador pero no la fila. Verificado en producción: 86 clientes con Sueldos activo, 85 con `liquidador_id` (la diferencia de 1 es un caso válido, ya contemplado por la alerta de Panel General).

Pendiente de aplicar:
- `add_asignaciones_servicio.sql` — tabla `asignaciones_servicio` (reasignación con historial para Impuestos/Monotributo, análoga a `asignaciones` de Sueldos pero generalizada por servicio+subtipo).

---

## Estado del proyecto (agosto 2026)

- **Fase 1–4** completas: acceso magic link, seguimiento, Drive sync, alertas email
- **Fase 5** en curso:
  - ✅ Reasignación de empresas (`/empresas` → ícono historial, admin only)
  - ✅ Productividad/KPIs (`/productividad`, admin only, desde junio 2026)
  - ⬜ README/documentación técnica
- **Fase 6 — multi-módulo** (13–14 ago 2026), primer paso hacia que BOS deje de ser "el sistema de Sueldos" y pase a tener un módulo por área (Sueldos, Impuestos, Contable, Monotributo), todos sobre la misma base de `clientes`:
  - ✅ **Panel General** (`/panel-general`) — tabla única por cliente con encabezado de dos filas por área/módulo, alta de clientes con asignación de servicios y responsables (desde `equipo`), baja puntual de servicio vs. baja general de cliente. Advierte en la celda Sueldos si falta `liquidador_id` en `/empresas` — es el origen del aviso de "clientes de Sueldos sin vincular" que se ve ahí.
  - ✅ **Módulo Impuestos** (`/impuestos`) — seguimiento mensual por subtipo (IVA / IIBB / Seguridad e Higiene), toggle de declaración, fecha de presentación, selector de pago/VEP.
  - ✅ **Módulo Contable** (`/contable`) — seguimiento anual de balances por formulario (855/F899/F713/F657/IGJ), envío de info, legalización, dos responsables, vencimientos calculados desde la fecha de cierre.
  - ✅ **Módulo Monotributo** (`/monotributo`) — categoría, cuota mensual, recategorización cuatrimestral (**febrero y agosto**, corregido desde el intento inicial ene/may/sep), campos de deuda con alertas visuales (filas en rojo) y botón para marcar aviso de deuda enviado.
  - ✅ Sidebar reorganizado por módulo (color por área) y renombrado: Empresas → Clientes, Liquidadoras → Equipo.
  - ⬜ Falta el selector de módulo al login (hoy se entra directo a Sueldos); Impuestos/Contable/Monotributo/Panel General se acceden solo desde el sidebar.
  - ✅ **Fix 20-ago**: `/empresas` y `/seguimiento` mostraban TODOS los clientes de `clientes`, no solo los de Sueldos (la alerta de "199 empresas sin liquidadora" era este mismo bug — contaba clientes de otros módulos que nunca debieron pedir liquidador). Ahora ambas pantallas filtran por `servicios_cliente(servicio='sueldos', estado=true)`, y `crearEmpresa` inserta esa fila al dar de alta para no volver a desincronizarse.
  - ✅ **Reasignación por módulo — Impuestos y Monotributo** (20-ago): mismo mecanismo que Sueldos (ícono historial junto al responsable, admin only, fecha efectiva por mes/año). Tabla nueva `asignaciones_servicio` (genérica por servicio+subtipo, ver `src/lib/asignacionesServicio.ts` — `getAsignacionesServicio`, `crearAsignacionServicio`, `resolverResponsablesVigentes`) y componente compartido `src/components/AsignacionServicioModal.tsx`. Cada página resuelve el responsable vigente por período (no el "actual" a secas) igual que `/seguimiento` lo hace con la tabla `asignaciones` de Sueldos. **Contable queda afuera a propósito**: cada fila de `balances` ya es por año y ya tiene su propio `responsable_id`/`responsable2_id` editable directo — agregar historial ahí sería redundante con cómo ya funciona.
  - ✅ **Panel de equipo visible por módulo** (20-ago): Impuestos/Contable/Monotributo tienen ahora un botón "Equipo" en el header que abre un panel lateral (`src/components/EquipoModuloPanel.tsx`) listando a las personas asignadas a esa área en Panel General (`equipo_modulos`), con la cantidad de clientes a cargo de cada una. Clickear a alguien filtra la tabla por esa persona (reusa el mismo estado que ya manejaba el desplegable "Todos los responsables" — quedan sincronizados). El filtrado por área en el backend ya existía desde que se crearon estos módulos; lo que faltaba era la parte visible.
- **Pendiente operativo — datos**: al corregir el fix de arriba se descubrió que ~197 clientes (de los 484 en `clientes`) fueron cargados en algún momento para otros módulos (Impuestos/Contable/Monotributo) directo en la tabla, fuera de la app, sin pasar por `servicios_cliente` — no tienen ninguna etiqueta de módulo. No aparecen en Sueldos (correcto) pero tampoco aparecen en Impuestos/Contable/Monotributo, que sí filtran por `servicios_cliente` desde que se crearon. Sus datos siguen intactos en `clientes`, solo falta re-cargarlos con el servicio correcto desde Panel General (o un script de import nuevo, si Giuliana tiene el Excel de origen).
- **Pendiente operativo**: configurar dominio propio en Resend para que los emails lleguen a las liquidadoras (hoy solo llegan al admin)
- **Pendiente operativo**: configurar SMTP propio (Resend) en Supabase Auth para los emails de login/invitación. Hoy usan el servicio compartido de Supabase, que tiene un límite bajo de envíos por hora (HTTP 429 en `/auth/v1/otp` si hay varios logins/invitaciones seguidos). Depende del punto anterior (dominio verificado en Resend) para poder mandar a cualquier destinatario, no solo al admin.

---

## Backlog de UX (feedback de Giuliana, sin implementar)

Pedidos comentados en una sesión anterior que no habían quedado escritos en ningún lado y por poco se pierden — capturados en bruto el 20-ago-2026, todavía sin precisar alcance ni prioridad:

- **Scroll horizontal**: pedido pendiente sobre desplazamiento de derecha a izquierda. Distinto del fix ya hecho de visibilidad del scrollbar (7/14-ago) — falta que Giuliana precise si es dentro de las tablas, entre pantallas, o navegación entre módulos.
- **Claves/accesos por módulo en la ficha maestra del cliente**: la ficha de cliente (tabla maestra, hoy en `/empresas` y `/panel-general`) tiene que permitir editar y cargar **todas** las claves/accesos del cliente (portales de Sueldos, Impuestos, etc.), cada una bien etiquetada con a qué módulo corresponde. Esa etiqueta es lo que la vincula al módulo: una clave marcada "impuestos" tiene que aparecer en la ficha de ese cliente dentro del módulo Impuestos, no solo en la maestra.
- **Sync bidireccional Panel General ↔ módulos**: si se carga/edita info de un cliente desde dentro de un módulo (tiene que estar permitido hacerlo ahí, no solo desde la maestra), eso se tiene que reflejar de vuelta en Panel General.
- ~~**Reasignación de responsable en cada módulo**~~ — ✅ hecho 20-ago para Impuestos y Monotributo, ver Fase 6 arriba. Contable no lo necesita (ya resuelve esto por año directo en `balances`).
- ~~**Sidebar de equipo por módulo, filtrado por área**~~ — ✅ hecho 20-ago, ver Fase 6 arriba.
- **Dashboard de productividad por módulo**: cuánto liquida/gestiona cada empleado, desglosado por tipo de impuesto (IVA/IIBB/SEH en Impuestos, y análogo en los demás módulos) — extender la idea de `/productividad` (hoy solo Sueldos) a los módulos nuevos.
- **Alertas por configurar**: falta definir alertas para los módulos nuevos — hoy solo Sueldos tiene alertas F.931 por email. Sin especificar todavía cuáles, para quién, ni con qué disparador.
- **Ajustes de diseño/interfaz**: hay cambios visuales que Giuliana quiere revisar, todavía sin detallar. Acordado que esto queda **al final**, después de que el resto del backlog (arriba) esté resuelto — tiene sentido: primero cerrar el modelo de datos y la paridad funcional entre módulos, después pulir interfaz.

---

## Contexto del cliente

- **KMA Consultores** — estudio contable, Buenos Aires
- **Giuliana Tignanelli** — administradora técnica (Athena Systems, athenasystems.latam@gmail.com), contacto principal y dueña de los accesos
- **Matías Serapio** — operador técnico designado por KMA Consultores (matiasserapio@kmaconsultores.com.ar); mantiene el sistema en el día a día, hace cambios y resuelve problemas
- **Liquidadoras** — empleadas de KMA que usan el sistema diariamente
- **María de Los Ángeles** — liquidadora cuyas empresas tienen Drive en SharePoint con estructura de categorías (diferente al resto)
