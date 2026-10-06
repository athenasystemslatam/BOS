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

- **Abrir Claude Code DENTRO de la carpeta del repo** (`C:\Users\ESTUDIO\Proyectos\BOS`), no desde otra carpeta: este archivo solo se lee automáticamente si la sesión arranca ahí, y la memoria de la conversación queda atada a la carpeta donde se abrió.

---

## Cómo trabajamos con Claude Code (reglas de la casa)

Estas reglas antes vivían solo en la memoria local de una sesión y no viajaban entre cuentas/PCs; acá quedan para todas.

**Antes de pushear**
- Preguntar "¿pusheo?" como paso aparte antes de **cada** `git push`; esperar un "dale, pushea" explícito.
- La confirmación es **por tema**: si hay más de un cambio/commit pendiente, decir cuáles son y preguntar cuáles subir. Nunca arrastrar cambios de otro tema en el mismo push.
- Antes de mostrar un cambio como listo: `npx tsc --noEmit` y `npx next lint`; `npx next build` si el cambio es grande o cruza módulos. (Un "Invalid supabaseUrl" en el build local es ruido conocido: no hay credenciales en local.)
- Antes de pushear: `git fetch` y mirar si `origin/main` avanzó (ver "Dos cuentas" abajo).

**Después de pushear**
- Verificar el deploy en `https://api.github.com/repos/athenasystemslatam/BOS/commits/<sha>/status`. Un `"pending"` con `"total_count": 0` **no** es "buildeando": es que Vercel todavía no reportó nada (una vez fue un incidente de Vercel). Esperar un estado real (`success`/`failure`/`error`). La API sin autenticar tiene un límite de ~60 consultas/hora: no consultar cada pocos segundos.
- Recién con el deploy en verde avisar que está en producción.

**Base de datos (Supabase)**
- Claude no escribe en la base. Si hace falta, dejar el `.sql` en `supabase/` (commiteado) y **darle al usuario el SQL para que lo corra** en Supabase → SQL Editor. Correr el SQL **antes** de pushear el código que lo necesita.
- Columnas nuevas: `alter table ... add column if not exists ...`.
- Columnas con `CHECK`: ampliar el constraint **antes** de migrar datos a un valor nuevo (`drop constraint` + `add constraint` con la lista completa), si no el `UPDATE` falla.
- Vistas (`vista_empresas`): antes de un `CREATE OR REPLACE VIEW`, reconstruirla desde la migración **más reciente** que la toque; solo se pueden agregar columnas al final, y usar una versión vieja tira columnas ya agregadas.

**Texto y datos**
- En texto visible decir **"cliente(s)"**, no "empresa(s)". No renombrar identificadores, tablas ni rutas (`/empresas`, `empresas.*`).
- Cuenta compartida `athenasystems.latam@gmail.com`: la usan **Giuliana y Matías**; no asumir quién está escribiendo.
- Matías no conoce bien Vercel/Supabase: explicar qué es cada panel antes de dar pasos; no asumir conocimientos de base de datos.
- Ante un pedido ambiguo o un cambio grande, confirmar el alcance antes de implementar. Si hay que decidir, dar una recomendación, no un menú de opciones.
- Ante un revert, ser exacto sobre qué está pusheado y qué es solo local. No reescribir historia ya pusheada (usar `git revert`, nunca `push --force`).

---

## Dos cuentas / dos colaboradores

Giuliana y Matías pueden trabajar en paralelo, cada uno con su cuenta de Claude.

- `main` es la fuente de verdad y despliega solo a producción. **La cuenta de la empresa (`athenasystems.latam@gmail.com`) tiene prioridad** y pushea a `main`.
- Matías, desde su cuenta, trabaja en ramas propias `matias/<tema>` e integra por PR o rebase (Vercel arma un deploy de prueba por rama, sin tocar producción).
- **Al arrancar:** `git fetch`, mirar `git log origin/main -10` y leer `NOTES.md`.
- **Antes de cada push:** `git fetch`. Si `origin/main` avanzó, `git pull --rebase`, volver a correr `tsc`/`lint` y recién ahí pushear. Git ya rechaza un push desde una copia desactualizada (non-fast-forward): no se pisa nada, el commit local no se pierde.
- **Nunca `git push --force`.**
- Antes de tocar un archivo, ver si cambió reciente en `main`. No modificar ni borrar trabajo de la otra cuenta sin dejarlo escrito en `NOTES.md`.
- **Cambios de base:** solo como archivos `.sql` en `supabase/` + una línea en `NOTES.md` ("SQL pendiente de correr"). Si dos personas cambian el esquema sin avisarse, Git no lo detecta.
- **Al cerrar una sesión:** actualizar `NOTES.md` (qué se hizo, qué falta) y commitearlo.
- Cada cuenta trabaja en **su propia copia del repo** (o su propia rama), nunca las dos en la misma carpeta con cambios sin commitear: se mezclan y Git no puede protegerlos.

---

## Stack

- **Next.js 14.2** App Router — Server Components + Server Actions (`"use server"`)
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

### Rol "cobranzas" (octubre 2026)

Rol nuevo (`add_rol_cobranzas.sql`): ve **todos** los módulos, no puede editar **nada**. A diferencia de `admin`/`liquidadora`/`viewer`, **no depende de `equipo_modulos`** — no hace falta agregar a la persona al equipo de cada módulo para que lo vea.

- `getCurrentLiquidadora()` devuelve `esCobranzas: boolean` (`rol === "cobranzas"`).
- `getAreasDelUsuario()` devuelve `[...MODULOS_VALIDOS]` de una si `rol === "cobranzas"` (bypassa el chequeo de `equipo_modulos`).
- `requireLiquidadoraOrAdmin()` y `requireAreaOrAdmin()` rechazan explícitamente a `esCobranzas` — así ningún módulo necesita un chequeo extra para bloquearle la escritura.
- En Seguimiento, Empresas e Impuestos/Contable/Monotributo, `puedeEditar` chequea `!yo?.esCobranzas` además del área/admin.
- `getCurrentLiquidadora`/`getAreasDelUsuario` están envueltas en `cache()` de React (memoización por request) — no son costosas de llamar varias veces en el mismo render.

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
- **`servicios_cliente`** — cliente_id, servicio, subtipo, estado (bool), responsable_id, fecha_baja (desde oct-2026). Qué servicios tiene activos cada cliente. Filtrar siempre por `estado=true`.
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

### Información de Sueldos (octubre 2026)
- **`sueldos_notas`** — cartelera de notas compartida del equipo de Sueldos (`/informacion`). `tema`, `contactos` (jsonb, array de `{nombre, corresponde, observaciones}`), `contenido` (texto con markdown-lite: `**negrita**`, `*cursiva*`, `~~tachado~~`, ver `renderRico()` en `InformacionClient.tsx`), `importante` (bool), `creado_por`. Edición gateada por `requireAreaOrAdmin("sueldos")`; Cobranzas no puede editar. Sin `modulo` (se sacó, era redundante — toda la sección ya es de Sueldos).

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
| `/informacion` | Cartelera de notas del equipo de Sueldos (octubre 2026) |

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

Archivo central: `src/lib/drive.ts`. Función pública: `scanClientesForMonth(clientes, mes, anio)`.

**Dos funciones de matching distintas** — NO intercambiarlas:
- `matchesMesFolder(name, mes, anio)` — **estricto**, para nombres de carpetas. Cada palabra debe ser un token de mes/año válido. Evita falsos positivos como "CARGAS SOCIALES 07-26".
- `matchesMonth(name, mes, anio)` — **flexible**, para nombres de archivos. El token de mes puede aparecer entre otras palabras.

**`classifyFile(filename)`** clasifica por nombre de archivo (`CampoManual | "recibos_vac" | "planilla_interna" | null`). Normaliza con `norm()` (minúsculas, sin tildes, **cualquier símbolo no alfanumérico — incluido el punto — se convierte en un espacio**) antes de aplicar las regex. Esto es clave para el bug de F.931 de abajo.

**Dos estructuras de carpeta soportadas, con comportamiento distinto:**
1. **Año/mes directo bajo SUELDOS** (la recomendada): `SUELDOS → 2026 → 08-2026 → (archivos o subcarpetas de categoría)`. Camino principal, filtra por período correctamente.
2. **Categoría primero** (común en la práctica, ej. Black Fish, Medeot, Kent Nayla): `SUELDOS → Cargas Sociales → 2026 → 08-2026 → archivo`. Entra por el fallback de categorías (`if (!anioId) { catChildren = ... }`, buscando palabras clave tipo "cargas", "recibo", "liquidacion" en el nombre de cada carpeta de primer nivel bajo SUELDOS).

**Bug corregido (oct-2026): mezcla de meses en la estructura "categoría primero".** Cuando una carpeta de categoría (ej. "cargas sociales") tiene año/mes **adentro**, el fallback antes recorría **todos los archivos de todos los años/meses juntos** con `listFilesRecursive` sin filtrar — el primer F.931 que encontraba (de cualquier mes) quedaba marcado como válido para **cualquier período** que se consultara. Esto hacía que, por ejemplo, septiembre diera "todo verde" sin tener nada subido todavía, con solo que agosto sí lo tuviera. Ahora, si la carpeta de categoría tiene año/mes adentro, se acota al mes pedido (`catAnioId`/`catMesId`) **antes** de listar archivos; si ese mes no existe ahí, no se escanea nada (no cae al escaneo amplio, que es justo lo que mezclaba períodos).

**Bug corregido (oct-2026): "F.931" con punto nunca matcheaba.** La regla de F.931 en `classifyFile` esperaba un punto opcional entre la F y el 931 (`f\.?9\.?3\.?1`), pero como `norm()` ya convirtió ese punto en un espacio antes de evaluar la regex, nunca matcheaba el nombre más común y oficial de AFIP: **"Declaración en línea Formulario F.931.pdf"**. Solo funcionaba si el archivo se llamaba "F931" sin separador, o si estaba dentro de una carpeta "cargas sociales" (ahí hay una regla de respaldo que sí lo encontraba, probando `/931/` contra el nombre crudo del archivo). Regex corregida a `f[\s.]?9[\s.]?3[\s.]?1` (contempla el espacio que deja la normalización).

**`drive_folder_id` cargado a mano — ojo con el nivel.** El código trata `drive_folder_id` como la **raíz del cliente** (busca adentro una subcarpeta de sueldos). Si se carga apuntando **a la propia carpeta SUELDOS** (un nivel de más), `findSueldosFolder` busca *adentro de SUELDOS* algo que matchee `SUELDOS_KEYS` (`sueldos`, `sueldo`, `liquidaciones`, `liquidacion`, `liq`) y puede agarrar por error una subcarpeta tipo "liquidacion" en vez de la real — rompe todo el scan para ese cliente sin que sea obvio por qué (pasó con Medeot y con Gonzalez Paula Carolina, este último directamente apuntando a la carpeta de **otro cliente** por error de carga). Si un cliente da mal en Drive y tiene `drive_folder_id` seteado, lo primero es chequear a qué carpeta apunta exactamente antes de sospechar del código.

**Estructura recomendada para clientes nuevos/reorganizados** (la que ya probamos que el código interpreta bien en ambos casos):
```
Cliente/
  └── SUELDOS/
      └── 2026/
          └── 08-2026/
              ├── Cargas Sociales/   (F.931, etc.)
              ├── Liquidacion/
              ├── Recibos/
              └── Sindicato/         (si corresponde)
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

**Emails de asignación/baja de servicio (octubre 2026)** — mismo mecanismo (Resend, no SMTP propio), uno por acción, nunca en lote:
- `sendEmailAsignacionServicio` — se dispara desde `crearAsignacionServicio` (modal "Historial de responsables") y desde `editarClienteConServicios` (Panel General) cuando un servicio **sigue activo** y cambia el responsable. Avisa al nuevo responsable: cliente, servicio, fecha.
- `sendEmailBajaServicio` — se dispara desde `darDeBajaServicio` y desde el mismo `editarClienteConServicios` cuando un servicio se **destilda** (pasa a `estado=false`). Avisa al responsable saliente, con la fecha de baja.
- Estas dos automatizaciones son mutuamente excluyentes a propósito: una baja nunca dispara el mail de transferencia y viceversa — ver el comentario en `editarClienteConServicios` (`panel-general/actions.ts`) si hay que tocar esto.
- Ninguna corta la operación si el mail falla (mismo criterio que `sendEmailTraspaso`, que ya existía).

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
MIDDLEWARE_CACHE_SECRET         # firma la cookie bos_chk (HMAC-SHA256) que cachea el chequeo de bloqueo de acceso en middleware.ts por 5 min — evita una consulta a Supabase en cada request. Cargarla SOLO en Vercel → el proyecto (no "Shared"), Production.
```

Se agregó un `.env.example` (commiteado) con estos mismos nombres, sin valores — referencia rápida de qué variable va en cada lado sin tener que grepear el código.

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
- `altas_nuevas_ago2026.sql` — corrida por Giuliana el 24-ago. Da de alta 11 clientes que aparecían en los Excel ESTATUS pero no existían en `clientes`. De los otros 24 CUIT que no matcheaban al principio: 14 eran clientes inactivos (bien, no tocar), 10 eran el CUIT del representante en vez del de la empresa (correcto — se usa para entrar a ARCA), salvo `3 AES SA` que tenía un typo real, corregido en el Excel de origen. `FUNDACION PAN Y ARTE` y `PAN Y ARTE SRL` quedaron marcados con ⚠ en `observaciones` por nombre casi idéntico — Giuliana confirmó (24-ago) que son dos clientes reales distintos, no un duplicado. La nota ⚠ sigue en la base (cosmética, no se limpió).
- `add_rol_cobranzas.sql` — amplía el constraint de `liquidadoras.rol` para aceptar `'cobranzas'`.
- `add_sueldos_notas.sql` + `rework_sueldos_notas_contactos.sql` — tabla de la sección Información de Sueldos; la segunda reemplaza `modulo`/`contacto` por la lista `contactos` (jsonb), ver "Información de Sueldos" arriba.
- `add_servicios_cliente_fecha_baja.sql` — columna `fecha_baja`, para el mail y el registro de baja de servicio.

**Correcciones puntuales de datos corridas directo en Supabase SQL Editor (octubre 2026, no quedaron como archivo `.sql` porque son fixes de una fila, no migraciones de esquema):**
- `liquidadoras.user_id` de Andrea Dilonardo (ficha de Cobranzas sin vincular a su login).
- `clientes.drive_folder_id` puesto en `NULL` para **MEDEOT MINUJEN ELEONORA** y **GONZALEZ PAULA CAROLINA** — en ambos casos el ID cargado a mano apuntaba mal (ver "Drive sync" arriba); al sacarlo, el matching automático por nombre los resuelve bien solo.
- `clientes.fecha_inicio_liquidacion` cargada para **GRUPO TOLF SRL** (2026-08-01) y **ELECTRONIC SOLUTIONS SA** (2026-09-01) — clientes nuevos de agosto/septiembre 2026 sin esa fecha cargada. Ojo: hoy este campo es solo informativo, **Seguimiento no lo usa todavía** para dejar de pedir tareas de meses anteriores al inicio (ver "Pendiente de funcionalidad" abajo).

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
- ✅ **Selector de mes roto en 4 páginas** (24-ago) — `/impuestos/dashboard`, `/impuestos/vencimientos`, `/monotributo/dashboard` y `/monotributo/vencimientos` tenían un `<select>` con `onChange` vacío que no navegaba al cambiar de mes (bug de Matías, quedó así al construir esas páginas). Se reemplazó por `src/components/MesSelector.tsx`, un client component nuevo que copia el patrón que ya funcionaba en `dashboard/MonthSelector.tsx` (Sueldos) — `router.push` con `mes`/`anio` en la URL. Contable no tiene este selector porque `balances` es anual, no mensual.
- ✅ **Monotributo agregado a Panel General** (24-ago) — `vista_empresas` no tenía columna de Monotributo (causó la falsa alarma del "197 sin módulo" el 24-ago). Se agregó `responsable_monotributo` a la vista (`add_monotributo_a_vista_empresas.sql`) y a `PanelGeneralClient.tsx`/`NuevoClienteModal.tsx` (columna nueva + opción de servicio al dar de alta un cliente, con su color ámbar como el resto del módulo).

### Completado (octubre 2026)
- ✅ **Rol Cobranzas** — ve todos los módulos, no edita nada, sin necesitar `equipo_modulos` por módulo. Ver "Rol cobranzas" arriba.
- ✅ **Exportar nómina de Sueldos a Excel** (`/api/exportar/nomina-sueldos`) — botón "Exportar nómina" en Seguimiento, visible para cualquiera con acceso a Sueldos (incluido Cobranzas). Columnas: Empresa, Liquidador/a, Nómina (cantidad de legajos), alineación/formato prolijo con ExcelJS.
- ✅ **Sidebar: secciones colapsables se resetean a cerradas en cada login/sesión nueva del navegador** (antes era un cookie permanente de un año; ahora es cookie de sesión, y `handleLogout` la limpia explícitamente al desloguear).
- ✅ **Sección "Información" de Sueldos** (`/informacion`) — cartelera de notas del equipo, con lista de contactos por nota y texto enriquecido liviano (sin librería nueva). Ver tabla `sueldos_notas` arriba.
- ✅ **Ficha de cliente (llavecita) en Panel General** — reutiliza `FichaClienteBoton` (ya usado en Contable): ver emails, domicilios, datos de Sueldos, claves de acceso, carpeta de Drive y observaciones sin descargar el Excel. El Excel sigue existiendo igual que antes.
- ✅ **`ClaveAcceso` acepta URL de acceso** (`ClavesAccesoEditor.tsx`) — campo opcional, mismo componente compartido por las 6 pantallas que editan claves.
- ✅ **Distinción transferencia vs. baja de servicio**, con mail a cada quien corresponde — ver "Alertas F.931 por email" arriba.
- ✅ **Memoización de `getCurrentLiquidadora`/`getAreasDelUsuario`** con `cache()` de React, y **cookie de chequeo de bloqueo en `middleware.ts`** (firmada HMAC-SHA256, 5 min) para no pegarle a Supabase en cada request — mejora de performance general, no cambia comportamiento.
- ✅ **Tres bugs de Drive sync corregidos** — ver la sección "Drive sync" arriba para el detalle técnico de cada uno:
  1. `drive_folder_id` apuntando un nivel de más (a SUELDOS en vez de a la raíz del cliente) confundía la búsqueda de la carpeta real.
  2. F.931 con punto en el nombre (`"Formulario F.931.pdf"`) nunca se detectaba por un desajuste entre la normalización y la regex.
  3. La estructura "categoría primero" (`SUELDOS → Cargas Sociales → 2026 → mes`) mezclaba archivos de todos los meses sin filtrar por período — podía marcar un mes como completo usando el archivo de otro mes.
- ✅ **`revalidatePath` agregado a `toggleManual`, `syncDrive` y `updateLegajos`** (`seguimiento/actions.ts`) — antes no revalidaban nada, así que Productividad (que lee los mismos campos de `tareas`) podía tardar hasta 30s en reflejar un tilde o una sincronización de Drive recién hecha.
- ✅ **Auditoría manual de carpetas de Drive de varios clientes** (Anabella y Claudia A., octubre 2026) — varios casos de "amarillo" resultaron ser archivos genuinamente no subidos (no bugs); los que sí eran bugs quedaron en los tres puntos de arriba. Varios clientes de Anabella reestructurados a mano a `SUELDOS → Año → Mes → Categoría` (Medeot, Aristizabal Natalia, Grupo Tolf SRL, Electronic Solutions SA).

### Pendiente de funcionalidad
- ⬜ Panel General: edición inline de datos de empresa, gestión de activaciones de servicios (hoy toda edición de cliente sigue siendo solo desde `/empresas`, que filtra a clientes de Sueldos — un cliente que es solo de Impuestos/Contable/Monotributo no tiene ninguna forma de editar sus datos ni sus claves)
- ⬜ Sync bidireccional Panel General ↔ módulos
- ⬜ Alertas para módulos nuevos (hoy solo F.931 de Sueldos) — Giuliana quiere revisar el flujo completo del sistema (general + cada módulo) antes de definir esto
- ⬜ Ajustes de diseño/interfaz (al final, después de cerrar el modelo de datos) — Giuliana lo sigue trabajando por su cuenta
- ⬜ **`clientes.fecha_inicio_liquidacion` no se usa en Seguimiento** (octubre 2026) — hoy es solo informativo (se muestra en fichas). Un cliente dado de alta este mes igual aparece como "pendiente" en períodos anteriores a su alta real. Falta decidir si Seguimiento debe filtrar por esta fecha antes de pedir tareas de un período.
- ⬜ **Webhook de auto-deploy de GitHub→Vercel se trabó una vez** (ver incidente en memoria de sesión, no documentado acá en detalle) — se resolvió con un deploy manual (`vercel --prod`), pero la conexión en sí (Vercel → Project Settings → Git, o GitHub → repo → Settings → Webhooks) no se revisó a fondo. Si vuelve a pasar (push sin deploy nuevo en `vercel ls` después de unos minutos), ese es el lugar para mirar.

### Pendiente operativo
- ⬜ ~~Configurar SMTP propio en Supabase Auth~~ — hecho por Giuliana (24-ago).

---

## Backlog de UX (feedback de Giuliana, sin implementar)

- **Claves/accesos por módulo — mitad hecha (24-ago)**: `ClaveAcceso` ahora tiene `modulo` (`src/types/index.ts`), editable desde `/empresas → Editar` (`ClavesAccesoEditor`, solo clientes de Sueldos hoy). Cada módulo (Impuestos/Contable/Monotributo) muestra, junto al nombre del cliente, un ícono de llave que abre un popover **de solo lectura** con las claves etiquetadas para ese módulo (`src/components/ClavesModuloPopover.tsx`). Faltan dos cosas: (1) editar desde dentro del módulo, no solo verlas — depende de que Panel General tenga edición de clientes (ítem de arriba); (2) cargar los datos reales — los ESTATUS casi no traían nada (solo 3 de 119 filas en Seg. e Hig. tenían usuario/clave, ya cargadas vía `claves_seh_ago2026.sql`) — el resto vive en Excels propios de cada liquidadora. Giuliana se lo va a pedir a Matías para juntarlos y que se importen cuando estén.
- **Alertas por configurar**: falta definir alertas para módulos nuevos — cuáles, para quién, con qué disparador. Bloqueado hasta que Giuliana revise el flujo general del sistema.
- **Ajustes de diseño/interfaz**: cambios visuales pendientes de precisar. Acordado que va al final, después de cerrar el modelo de datos y la paridad funcional entre módulos.

---

## Contexto del cliente

- **KMA Consultores** — estudio contable, Buenos Aires
- **Giuliana Tignanelli** — administradora técnica (Athena Systems, athenasystems.latam@gmail.com), contacto principal y dueña de los accesos
- **Matías Serapio** — operador técnico designado por KMA Consultores (matiasserapio@kmaconsultores.com.ar); mantiene el sistema en el día a día, hace cambios y resuelve problemas
- **Liquidadoras** — empleadas de KMA que usan el sistema diariamente
- **María de Los Ángeles** — liquidadora cuyas empresas (ej. Black Fish SRL) suelen tener Drive con estructura "categoría primero" (`SUELDOS → Cargas Sociales → 2026 → 08-2026`, ver sección "Drive sync"), no SharePoint — es Google Drive igual que el resto, solo que con otro orden de carpetas.
