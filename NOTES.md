# NOTES — memoria compartida entre sesiones

Cada sesión (Giuliana / Matías, cualquier cuenta de Claude) deja acá qué hizo y qué quedó pendiente, para que la siguiente no lo tenga que adivinar. Ver reglas en `CLAUDE.md` → "Dos cuentas / dos colaboradores".

## Pendientes al cerrar la sesión del 26-oct (Matías)

Hecho ese día:
- Ítem 119 — rol "administrativo" (consulta solo lectura en Contable, acceso completo a Libros, edita Panel General como un admin; no el resto de acciones exclusivas de admin). `supabase/add_rol_administrativo.sql` **corrida** por Matías el 26-oct.
- Ítem 80 — Seguimiento ya no muestra a la persona de una asignación vieja tapando una edición directa del responsable más reciente (gana quien se tocó último, comparando `asignaciones.creado_en` contra `clientes.fecha_modificacion`). No toca Productividad (resuelve períodos históricos, ahí sigue ganando la asignación histórica).
- Ítem 147 — Sueldos: botón "Descargar Excel" en Dashboard y en Seguimiento (checklist del período), mismo patrón que Libros (`obtenerDatosDashboardSueldos`/`obtenerSeguimientoSueldos` en sendos `datos.ts`). El backup de Sueldos ya existía solo en el Dashboard; no se duplicó en Seguimiento.

Queda pendiente, fuera de código:
- **Janina:** sigue sin destildarle el área Contable en `/equipo` (viene del 23-oct, ver abajo).
- Si se le quiere dar el rol administrativo a alguien, falta tildarle las áreas Contable y/o Libros en Equipo.

## Pendientes al cerrar la sesión del 23-oct (Matías)

Hechos ese día: ítems 105, 106, 107, 109, 122, 118, 85, 81, 82, 129 y 124 (detalle en cada bloque de abajo). Quedan sin cerrar, todos fuera de código:
- **108 (No corresponde):** hecho; falta la prueba con el caso testigo Smart Farming 2026. Smart Farming S.R.L. está activo pero **no tiene el servicio Contable** ni ningún balance: definir si se le activa, su fecha de cierre y el motivo (ítem 135, equipo contable).
- **Fecha de cierre fija faltante** (no se generan sus balances): Fundación Pan y Arte, Herpam SA, Pan y Arte SRL, Rivadavia SA.
- **Janina:** destildarle el área Contable en `/equipo`.
- **F.931 2027:** cargar el calendario oficial cuando lo publique ARCA, y verificar la fecha cargada de diciembre 2026 CUITs 0-3 (09/01/2027, sábado).
- **124:** cargar las fechas reales de presentación de los 71 balances terminados (a mano o importándolas del ESTATUS, ítems 130/134).
- Desde la PC de Matías los commits salen como `athenasystemslatam` (config local del repo), y Claude in Chrome solo se usa desde el perfil aislado "Claude BOS".

## SQL pendiente de correr en Supabase

Ninguno (Libros: etapas 1 a 11 corridas al 20-oct; `add_balances_vto_ganancias.sql`, `add_contable_reglas_vencimientos.sql`, `add_balances_no_corresponde.sql`, `add_clientes_cierre_cambios.sql` y `add_balances_fechas_reales.sql` corridas por Matías el 23-oct; `add_rol_administrativo.sql` corrida por Matías el 26-oct).

### Objetivo "0 en término" — ítem 124 (23-oct, Matías)

- Causa: `add_balances_fechas_automaticas.sql` (20-oct) cargó en lo ya presentado `presentado_fecha`/`f855_fecha` = `updated_at` (fecha de la migración), así que todo daba tarde.
- `presentado_fecha_real` / `f855_fecha_real`: true en lo que BOS registra solo desde el 21-oct y en lo cargado a mano (Seguimiento → ⋯ → "Fechas de presentación…"). Lo aproximado no cuenta ni en término ni tarde: Dashboard muestra "· N sin fecha real" y Seguimiento marca "!" junto a "En ARCA".
- F.855 en la línea del objetivo es a propósito (ítem 70: piso = balance y 855 en término).
- Las fechas reales históricas probablemente estén en el ESTATUS de balances: importarlas es parte del ítem 130 (definir antes qué fuente manda, ítem 134).

### Fecha de cierre fija que genera el balance de cada año — ítem 109 (23-oct, Matías)

- Ya existía (`04305ed`): `clientes.cierre_ejercicio_mes/dia`, editable en Panel General → Editar (con Contable), autocompleta "Agregar balance".
- Nuevo: botón "Generar balances {año}" en Seguimiento Contable (`generarBalancesDelAnio`): un balance "Sin asignar" por cliente activo con Contable y cierre fijo que no lo tenga; muestra antes la lista y los clientes sin cierre fijo. No toca los existentes.
- Nuevo: cambiar un cierre ya cargado pide motivo y queda en `clientes_cierre_cambios`. El balance cuya fecha no coincide con la fija se marca con "!" en la columna Cierre.

### Contable: resp. 2 y balance nuevo — ítem 82 (23-oct, Matías)

- "+ resp. 2" ahora muestra el segundo desplegable (antes guardaba "" y nunca aparecía); no guarda nada hasta elegir a alguien.
- "Agregar balance" recarga la página al crear, así el balance aparece al toque (igual que "Generar balances").
- El punto 2 del ítem (elegir responsable pasa de Sin asignar a Asignado) ya estaba resuelto por el ítem 34.

### Guardados que fallaban sin aviso — ítem 81 (23-oct, Matías)

- `src/components/AvisoErrorGuardado.tsx`: `guardar(accion)` devuelve el error de una Server Action (o de conexión) y `useAvisoErrorGuardado()` muestra un aviso abajo a la derecha. Usarlo en cualquier pantalla nueva con cambios optimistas.
- Seguimiento Sueldos: casillas (recibos, F.931, etc., Preliquidado/Novedades) vuelven atrás si el guardado falla. Legajos, observaciones, nota sig. mes y alícuota ART no borran lo escrito, solo avisan.
- Contable: cualquier cambio de la fila (casillas, EECC, responsable, frenar, no corresponde, observaciones) vuelve el balance a como estaba y avisa.

### Años fijos y 2027 — ítem 85 (23-oct, Matías)

- Contable: el selector de años sale de `getAniosContables()` (`src/lib/aniosContables.ts`): años con balances desde 2025 + el año en curso. 2027 aparece solo en enero.
- F.931: `FECHAS_OFICIALES` en `src/lib/vencimientos.ts`, por año. **Pendiente: cargar 2027 cuando ARCA publique el calendario** (suele ser en diciembre), mismo formato que 2026. Hasta entonces 2027 usa estimado (9/10/11 del mes siguiente corrido a día hábil, sin feriados) y `/vencimientos` lo avisa en naranja.
- `/vencimientos` ya no dice 2026 fijo: año del mes de trabajo, con flechas para cambiar; el link del Dashboard de Sueldos lleva al año del período.
- Aviso de vencimientos del período diciembre (SeguimientoClient) se calculaba con el año siguiente → corregido.
- **A verificar:** el dato oficial cargado para F.931 de diciembre 2026, CUITs 0-3, es 09/01/2027, que cae sábado. Confirmar contra la resolución de ARCA (probablemente sea lunes 11/01).

### Responsables inactivos en Contable — ítem 118 (23-oct, Matías)

- "Inactivo" para Contable = `activa: false` o sin el área `contable` en `equipo_modulos`. Sigue visible con su nombre + "(inactivo)" en los balances donde ya está (Seguimiento: opción deshabilitada en el desplegable, no se puede asignar a otro), en el resumen por contador del Dashboard y en Productividad Contable (ahora trae también a los dados de baja).
- **Janina** no se saca por código: tiene marcada el área Contable en `/equipo`. Hay que destildársela ahí (lo hace un admin).
- Ojo ítem 119 del estatus: figura "Hecho" pero no existe ningún rol "administrativo" en el código.

### Cruce del estatus del 23-oct (Matías)

Figuran pendientes en el Sheet pero ya están hechos: 79 y 127 (`6c3c41b`), 91 (con el 107), 120 (`94bd7a3`), 121 y 123 (`d33861c`), 64 (`84b6665`/`afcaf55`), 76/77/78 (20-oct, ver arriba), 109 (este), 114 (fecha de recepción ya se guarda, `156f2d0`), 93 (F657 pasó a casilla, `720c151`). 122 (avance en 0 en el Dashboard: la consulta no traía envio1/info_recibida/estado_eecc) corregido el mismo día, junto con las columnas "Total {año}" del resumen por contador.

### Estado "No corresponde" en Contable (23-oct, Matías)

- Manual como Frenado (menú ⋯ → "No corresponde…", motivo obligatorio: otro estudio / entró con el ejercicio iniciado / baja / otro). Se vuelve con "Vuelve a corresponder" (recalcula desde EECC).
- `cuentaBalance()` en `contable/semaforo.ts`: filtro único para no contarlos. Aplicado en Seguimiento (chips y conteo por responsable; solo se ven en el chip "No corresponde"), Dashboard, Vencimientos, Equipo y Productividad Contable. Cualquier pantalla nueva que cuente balances tiene que pasar por ahí.

### Reglas de vencimiento configurables — ítem 91 (23-oct, Matías)

- Una sola fórmula: `src/lib/vencimientosContables.ts` (pura, la usa también ContableClient) + `vencimientosContablesServer.ts` (`getContextoVencimientos().resolver(balance)`). La usan Seguimiento, Dashboard, Vencimientos y Productividad Contable; no volver a escribir `cierre + N` en una pantalla.
- Niveles: (1) regla por vencimiento base + días en `objetivos_area.config.reglas_vto` (espejo en `balance_dias_vto`/`f855_dias_vto_extra`), más el ajuste en días por cliente del ítem 67; (2) prórroga por rango de cierre; (3) fecha manual por balance con motivo. Todo desde Productividad → Configuración (solo admin). Marcas P/M en Seguimiento y Vencimientos, con el motivo en el globito.
- Reemplaza lo del mismo día: se sacaron el botón "Prórroga Ganancias" y la edición de la fecha de Ganancias en Seguimiento.
- Quedó afuera (ítem aparte): correr fechas por fin de semana o por terminación de CUIT.

### Vencimiento de Ganancias como fecha propia (23-oct, Matías)

- `balances.vto_ganancias`: null = regla (mismo día que el VTO balance, cierre + 135); con fecha = prórroga. Se edita en Seguimiento Contable (columna "Vto Gcias", azul si está prorrogado, ↺ para volver a la regla) o en lote con "Prórroga Ganancias" (por mes de cierre del año fiscal, pisa también los cargados a mano — `aplicarProrrogaGanancias`).
- No mueve el VTO balance ni F.855/F899/F657, ni los filtros "Vencidos"/"Vencen en 30 días" (siguen por VTO balance). Vencimientos suma la columna "VTO Ganancias".

### `.claude/settings.local.json` fuera de Git (23-oct, Matías)

- Son los permisos que cada persona le aprueba a Claude Code en su PC; estaba commiteado y se mezclaban entre cuentas. Se sacó del repo (`git rm --cached`) y quedó en `.gitignore`. **Ojo Giuliana:** al hacer `git pull` de este cambio, Git **borra tu copia** del archivo. Antes del pull, copialo afuera (`copy .claude\settings.local.json %TEMP%\`) y después volvelo a poner en `.claude\` — o no hagas nada y Claude Code te vuelve a pedir los permisos de a uno. No afecta a la app ni a producción.

### Velocidad de todo BOS (20-oct, `2e651a4` + `f6d6a3e`)

- La sesión se consulta una vez por click (`getUsuario` con `cache()` en `lib/auth.ts`).
- Seguimiento/Dashboard de Sueldos, Productividad, Empresas, Panel General, Impuestos, Monotributo y Contable: consultas en paralelo en vez de una atrás de otra; Contable ya no repite consultas.
- Copiar legajos del mes anterior: al instante si el período es nuevo; si no, como mucho 1 vez por hora (tag `sueldos-legajos`, invalidado por `updateLegajos`).
- Tareas y asignaciones se leen de a 1000 filas (`traerTodas`): antes PostgREST las cortaba en 1000 sin avisar (Productividad, Empresas y legajos ya superaban ese número).
- Quedó afuera a propósito: cambiar el `<a>` del Sidebar por `<Link>` (riesgo de datos viejos, ya pasó), `loading.tsx` global e índices nuevos (requieren SQL).

### Velocidad de Libros (20-oct)

- Vercel (`pdx1`, Portland) y Supabase (`us-west-2`, Oregon) están en la misma zona: no hace falta cambiar la región.
- Cartel de Objetivos en caché 5 min y lo automático (`sincronizarLibrosAutomaticos`) como mucho cada 10 min al abrir pantallas; los dos se invalidan al guardar cualquier cosa en Libros (`refrescarLibros()` → `revalidateTag(TAG_LIBROS)`). El cron usa `sincronizarLibrosAutomaticosAhora` (sin caché). Cambios hechos fuera de Libros (estado del cliente en Panel General, balances en Contable) se reflejan en el cartel en hasta 5 min.
- `libros/loading.tsx`: esqueleto de carga al navegar entre pantallas de Libros.

### Clientes inactivos en Libros (20-oct)

- El servicio Libros no se da de baja: un cliente está en Libros mientras esté activo en BOS (`clientes.estado = 'activo'`). Seguimiento, Dashboard, Objetivos, mails y lo automático solo cuentan clientes activos (`clientes!inner(...)` + `.eq("clientes.estado", "activo")`). Libros → Clientes tiene Activos / Inactivos / Todos (arranca en Activos); el historial de los inactivos se conserva y se ve en su ficha. El estado del cliente se cambia solo en Panel General.

### Objetivos de Libros (20-oct, `src/lib/librosObjetivos.ts`)

- Métricas que calcula BOS: % SA/SAS con mandato cargado, % mandatos vencidos con renovación iniciada / cerrada, % libros con dato completo (último copiado + folios), % clientes con puesta al día completa, % envíos anuales copiados dentro de 60 días (desde que se crearon las tareas por balance legalizado).
- Cartel fijo arriba de todas las pantallas de Libros (`libros/layout.tsx`) con los objetivos actuales; Dashboard con sección Objetivos primero y Cumplidos. Con fecha límite, al llegar a la meta pasan solos a cumplido; sin fecha = permanente.
- Se editan en Configuración (admin), con machete SMART en el "?".

### Mails de Libros (20-oct, `src/lib/librosMails.ts`)

- Cron diario `/api/alertas/libros` (8:00 ART, solo corre desde `main`). Lunes a viernes: **mail diario** a cada
  persona del equipo de Libros (equipo_modulos 'libros', con mail, no excluida) con lo de sus clientes (responsable
  de Libros del cliente o del pedido) más lo de clientes sin responsable: seguimientos vencidos, avisos de mandato
  (cada umbral una sola vez) y folios bajos sin pedido. Si nadie del equipo lo recibe, va a los admins.
- **Resumen semanal** el día configurado (viernes por defecto) a las personas elegidas (por defecto los admins):
  puesta al día, mantenimiento, tareas por prioridad, mandatos y avance por responsable.
- Se configura en Libros → Configuración → Mails. Reemplazó a `sendAlertasLibros` de `email.ts` (un solo mail a
  ADMIN_EMAIL).

Ninguno de Libros. Corridos el 19-oct: `add_libros_etapa9.sql` y la importación de ENTRADA Y SALIDA e INCIDENCIAS
del sheet (`supabase/importar_libros_movimientos_control.sql` + `importar_libros_movimientos.sql`, fuera del repo por
datos de clientes; se generan desde los CSV de Descargas). Cruce: 336 de 355 movimientos (136 con libros separados,
200 con el texto del sheet) y 27 de 29 incidencias; quedaron afuera clientes que no están en BOS (DIGISTORE, NORTH
COFFEE, ROGEM, LOGISTICA DIEB…) y filas con dos clientes ("MIT, GETEL FIRST", "BLACKWATER/IVAISA"). Tipo y destino
deducidos del comentario; 32 ambiguos quedaron como entrada / otro. Lo importado tiene `importado = true`.
"BARILOCHE" → IGI BARILOCHE y "MADRYN" → IGI MADRYN (cruce por nombre) confirmados por Giuliana.

**Última importación del sheet (20-oct)** — `supabase/importar_libros_delta_20oct{,_control}.sql` (fuera del repo):
diferencias del sheet contra lo importado el 19-oct. Se aplicaron 49 prioridades reordenadas, los copiados del 19/10
de IVAISA y SAMRAY (actas), 7 movimientos del 14 al 19/10 (6 libros quedaron "en la copiadora" con la tarea en
Copiándose) y 1 tarea nueva (BOULEVARD PILAR · Inventario y Balance). **No** se importaron 794 filas de
ACTUALIZACION generadas en bloque (una por libro de cada cliente, "P1 · Pendiente"): BOS ya las calcula en "Atrasos
sin asignar". Desde el 20-oct el sheet queda en solo lectura: todo se carga en BOS.

`add_libros_etapa8.sql` (vencimiento preciso del mandato) también corrido el 19-oct.

`add_libros_etapa7.sql` (Dashboard: fecha meta y `libros_snapshot`) corrido el 20-oct.

Corridos el 19-oct: `add_libros_etapa6.sql` y la importación del trabajo en curso del sheet
(`supabase/importar_libros_trabajo_control.sql` + `importar_libros_trabajo.sql`, **fuera del repo** por datos
de clientes, en `.git/info/exclude` de la PC Windows; se generan desde los 4 CSV de Descargas). Antes,
`add_libros_etapa3.sql` y `add_libros_etapa4.sql` verificados como aplicados.

Resultado de la importación (control previo): 33 libros dados de alta como tomo 1 con nota "completar rúbrica,
folios, último copiado y ubicación", 102 tareas abiertas (prioridad a mano "Orden del sheet"), 64 copiados de
historial, presupuestos de tomo/libro nuevo (7 omitidos por tener uno abierto) y 36 facturas de la copiadora
(RODAL y GEN cruzados por CUIT; HYGGE y VVG por nombre, inactivos). Hay dos "Candela" activas: el responsable
de los presupuestos se asignó solo si había una sola en el equipo de Libros.
**Quedaron afuera** FLASHOVER y FUNDACION PAN Y ARTE (sin servicio Libros) y TALLER BILLY (inactivo): cuando
se les active Libros y se cargue el tipo societario, se vuelve a correr la importación (no duplica).

## Módulo Libros Societarios (en producción desde el 20-oct-2026; rama `libros/modulo` integrada a `main`)

Reemplaza el Google Sheet "GESTION DE LIBROS". Se trabaja en la rama `libros/modulo` y se integra a `main` por PR, por etapas (cada una se muestra en el deploy de prueba de la rama antes de seguir):
1. ✅ SQL `add_libros_etapa1.sql` (**corrido** en Supabase el 16-oct): `clientes_societario`, `libros_catalogo` (43 libros cargados), `libros`. Ficha "Societario y libros" en `/libros/clientes/[id]`.
2. ✅ Seguimiento (`/libros`): SQL `add_libros_etapa2.sql` (**corrido** 16-oct: `libros_estados`, `libros_tareas`, `libros_pedidos` — esta última sin pantalla hasta la etapa 3). Cola por cliente (un bloque por cliente y nivel; el nivel es el de su tarea más urgente; subir/bajar renumera `orden_manual` de las tareas abiertas del cliente). Prioridad propuesta por `prioridadSugerida` en `src/lib/libros.ts`; `prioridad_manual` solo si se cambió a mano (con motivo). "Al día" en `libroAlDia`: anual = último cierre con balance vencido (cierre + 135 días), trimestral = último trimestre cerrado hace +30 días, por evento no cuenta; compara por mes. Registrar copiado valida folios antes de escribir y con ≤ 10 folios libres crea `libros_pedidos(tipo='presupuesto_tomo_nuevo', automatico)` (índice único: uno abierto por libro). Antes se corrió también una corrección de la importación (organismo por jurisdicción legal, 50 libros a ubicación cliente, Candela P. como responsable de Libros), fuera del repo por datos de clientes.
3. ✅ Pedidos y trámites + Entrada y salida + Copiadora (`154310f`). SQL `add_libros_etapa3.sql` **corrido**.
4. ✅ Configuración (`/libros/configuracion`, admin: umbral de folios + renombrar/reordenar estados; los motivos siguen siendo texto libre) + digest diario de alertas al admin (`/api/alertas/libros`, `.github/workflows/alertas-libros.yml`) (`df0ae6d`). SQL `add_libros_etapa4.sql` **corrido**. El cron de GitHub solo corre desde `main` y le pega a producción: no se dispara hasta integrar el PR.
5. ✅ Ficha + indicador Contable (`03a2a61`, ver "Etapa 5" abajo). Sin columna en Panel General (decisión sep-2026). Conexión con Contable (`balances.estado` → 'legalizado'/'finalizado', NO `estado_eecc`). Coordinar con Matías el pendiente "Legalizado pasa solo a Finalizado".
6. ✅ Migración desde el sheet (cruce por CUIT) — **adelantada y corrida el 16-oct**: 93 clientes con Libros activo + tipo societario, 342 libros (tomo 1), 27 mandatos. El SQL (`supabase/importar_libros_sheet.sql` + `_control.sql`) y los CSV de origen quedaron **fuera del repo** a pedido (tienen datos de clientes); en la PC de origen están en `.git/info/exclude`. Para revisar a mano en la ficha: último copiado con fecha futura en CUSTOMCOFFEE (Libro de Actas, 31/12/2026) y METALURGICA PINTARELLI (Inv. y Balance, 01/11/2026); CISEC y RODBALL tenían "B2025-2026" / "2026 renovación cargos" y se cargaron como 2026; 3 mandatos solo traían el año (se cargó 01/01, con nota en observaciones).

Clientes del módulo = `servicios_cliente(servicio='libros', estado=true)` (se activa desde Panel General → Editar).

### Etapa 6 — flujo único + mandatos (19-oct, a partir de la auditoría de Giuliana)

- **Seguimiento = un solo flujo**: cada bloque de cliente muestra lo de una fila de ACTUALIZACION (libro, prioridad,
  estado, período, envío, retiro, detalle editable). Botones "Enviar a copiar" (`enviarACopiar`: movimiento de salida
  + Copiándose) y "Retirado / Registrar copiado" (`registrarCopiado`: entrada si el libro estaba en la copiadora,
  folios, historial y factura pendiente de la copiadora para el cliente, reutilizando una sin recibir si ya había).
  Entrada y salida y Copiadora quedan de consulta. Se sacaron de la tabla las columnas Responsable e Insistencias
  (los datos siguen en la base).
- **Automático** (`src/lib/librosAutomaticos.ts`, corre al abrir Seguimiento y Pedidos y en el cron): tareas del envío
  anual cuando el último balance está legalizado/finalizado (una vez por libro y balance), pedido de tomo nuevo por
  folios bajos (una vez por tomo) y renovación de autoridades al primer aviso de mandato (90 días por defecto, uno por
  cliente y mandato, con checklist, responsable de Libros y seguimiento a 7 días; pasa a P1 si el mandato vence).
- **Prioridad**: P1 solo por fecha límite de un tercero, pedido con fecha o balance legalizado con acta por hacer.
  Mandato vencido y folios bajos ya no suben las tareas.
- **Mandatos**: cerrar la renovación pide la designación y duración nuevas y actualiza `clientes_societario`; el
  mandato anterior queda como seguimiento del pedido. Mail diario: cada umbral (90/60/30/vencido) una sola vez.
  Filtro "Mandato sin cargar" (SA y SAS) en Libros → Clientes.
- **Puesta al día**: "Atrasados" (con último copiado) separado de "Sin dato" (hay que relevar, no copiar).

### Ajustes tras la prueba (19-oct, etapa 9)

- Prioridades (definición final, `DEFINICION_PRIORIDAD` en `src/lib/libros.ts`): P1 Urgente (fecha que no depende del
  estudio, balance legalizado con acta, mandato vencido = tareas de una renovación vencida), P2 Planificado (envío anual
  o material listo), P3 Bloqueado (falta material/información o sin libro esperando presupuesto). "?" en cada nivel.
- Seguimiento: "+ Agregar" (`AgregarTareaModal.tsx`: cliente, uno o varios libros, alta de libros faltantes con
  `altaLibroRapida`); aviso "N mandatos vencidos · N vencen en 90 días · Ver" sin lista.
- Renovaciones: estado derivado (`estadoRenovacion`): Pendiente / En curso / Cerrada, sin columna nueva.
- Pedidos: circuito de presupuestos Pedido → Enviado (monto, fecha) → Respuesta → Aprobado → "Abrir tomo nuevo"
  (`abrirTomoDesdePedido`: activa el "sin libro" o abre el tomo siguiente y cierra el pedido).
- Dashboard: en empresas y libros, por tipo de libro (Actas, Inv. y Balance, Diario, IVA, Registros) y por tipo
  societario; Logrado cuenta el historial importado del sheet + lo registrado en BOS; tarjetas ordenables arrastrando,
  orden guardado por usuario (`libros_preferencias`, por mail de login).
- Entrada y salida: muestra movimientos/incidencias sin libro (cliente + texto del sheet, marca "del sheet").
- Copiadora: todo editable en un modal; una factura puede sumar varios copiados del mismo cliente
  (`vincularTareasFactura` / `desvincularTareaFactura`).

### Ajustes tras la prueba (19-oct, etapa 8)

- Seguimiento: aviso de renovaciones solo con el número y link a Pedidos filtrado (`?tipo=renovacion_autoridades&en_curso=1`);
  pestañas "Cola · N clientes" y "Atrasos sin asignar · N libros en M clientes" (ex Puesta al día, sin el avance: va
  al Dashboard); un buscador por cliente o CUIT para las tres pestañas; orden por arrastrar y soltar (agarrando el ícono
  de la izquierda del bloque), guardado en `orden_manual` para todo el equipo; se sacaron las flechas.
- Registrar copiado propone "copiado hasta" = último cierre exigible del libro (en el envío anual, el cierre del
  balance si es posterior); al confirmar actualiza `libros.ultimo_periodo_copiado` (se queda con el mayor).
- Mandato: `vencimientoFinal` (`src/lib/libros.ts`) = vencimiento preciso o designación + años; lo usan avisos,
  mail, renovaciones, Dashboard, fichas y la llavecita de Panel General. Editable desde la lista de Clientes
  (`MandatoModal`) y la ficha (`MandatoCampos`, 3 años por defecto en SA). Si al guardar queda vigente por más que el
  primer aviso (o indeterminado), la renovación abierta se cierra sola con una nota en su historial.

### Etapa 7 — Dashboard (`/libros/dashboard`, 19-oct; se llamó Tablero hasta el 19-oct)

- Visible para todo el equipo; "Avance por responsable" solo para admin (la parte de cada persona = libros de los
  clientes que tiene asignados en Libros).
- Atraso por libro en `atrasoLibro` (`src/lib/libros.ts`): ejercicios (anual) o trimestres hasta lo exigible hoy;
  "sin dato" y "sin libro" aparte; por evento no cuenta. La ficha muestra "Atrasado · faltan N ejercicios".
- `src/lib/librosTablero.ts`: `calcularAtraso` + `guardarSnapshots`. La foto del día la guarda el cron del mail
  (`/api/alertas/libros`) y también el Dashboard al abrirse. **Línea base** = fila `es_base` con fecha 16-oct,
  calculada una sola vez (la primera vez que corre) con los datos actuales a esa fecha. Es el estado del sheet
  importado mientras no se registren copiados desde la app antes de esa primera corrida; si ya se habían
  registrado, la base queda un poco más baja que la real.
- "Puestos al día" = libros que en la foto de referencia (hace 7 / 30 días, o la base) no estaban al día y hoy sí.
  "Envíos anuales copiados" = tareas de origen balance terminadas en el período.

### En qué quedó (16-oct, segunda sesión)

- Etapa 3 **completa, commiteada y pusheada** en `libros/modulo` (`154310f`).
  - SQL `add_libros_etapa3.sql` **pendiente de correr** en Supabase (ver "SQL pendiente" arriba).
  - Deploy de prueba: https://bos-git-libros-modulo-athena-systems.vercel.app
  - Sidebar: 3 links nuevos bajo Libros (Pedidos / Entrada y salida / Copiadora).
  - Decisión de diseño: para presupuestos (`presupuesto_libro_nuevo`/`presupuesto_tomo_nuevo`),
    aprobar el pedido NO crea tareas automáticas — el nuevo tomo se abre desde la ficha del libro.
    Para todos los demás tipos, al aprobar se seleccionan los libros y se crean las tareas.
  - `equipo` en MovimientosClient se recibe pero no se usa todavía (reservado por si se agrega
    filtro de responsable; se puede quitar si queda sin uso al cerrar el módulo).
- **Falta:** correr el SQL de etapa 3 en Supabase, probar las 3 pantallas nuevas.
- **Próximo:** etapa 4 (Alertas, Configuración, mails).

### En qué quedó (16-oct, cierre de sesión)

- Etapa 2 **completa, commiteada y pusheada** en `libros/modulo` (`82c3ec4`), deploy de prueba en verde: https://bos-git-libros-modulo-athena-systems.vercel.app/libros. `tsc` y `lint` limpios. No queda nada a medias sin commitear.
- **Falta:** que Giuliana la pruebe en el deploy de prueba y la apruebe (cola, puesta al día, registrar copiado, historial en la ficha). Ojo: el deploy de prueba usa la base de producción y "Registrar copiado" no tiene deshacer.
- **Después:** etapa 3 (pantalla de Pedidos y trámites sobre `libros_pedidos`, que ya existe, + Entrada y salida con `libros_movimientos` y `copiadora_facturas`, que todavía no existen: van en `add_libros_etapa3.sql`). Al registrar una salida a copiadora, la tarea pasa al estado `codigo='copiandose'`.
- Nada de esto está en `main`: se integra por PR al final.
- **Solo en la PC de origen (no viajan con el repo):** los CSV del sheet (en Descargas) y los SQL de importación/corrección (`supabase/importar_libros_sheet*.sql`, `supabase/corregir_importacion_libros*.sql`), ya corridos los dos. Desde otra PC no hacen falta para seguir.
- En otra PC: `git fetch && git checkout libros/modulo`, `npm ci`, y verificar que la identidad de Git sea la de la cuenta que corresponde.

## Etapa 5 — Ficha + indicador Contable (oct-2026)

Decisiones:
- Libros NO va como columna en Panel General (decisión sep-2026, se mantiene).
- La sección "Societario y libros" se agregó a `FichaClienteBoton` (modal "Ver ficha" de Panel General y Contable).
  (`rediseno-panel-general` ya está integrada a `main` y `FichaClienteBoton.tsx` sigue en uso ahí: no hay nada que portar.)
- Indicador de balance Contable en `/libros/clientes`: badge "Acta pendiente" (ámbar) si
  `balances.estado = 'legalizado'`; badge "Finalizado" (gris) si `'finalizado'`. Solo lectura de
  la tabla balances, sin tocar el módulo Contable.

## Pendientes / decisiones abiertas (21-sep-2026)

- **F657 como casilla**: hecho localmente en `ContableClient.tsx` pero **sin pushear** (esperando OK de Matías). No había ningún balance con F657 en N/A, así que no se pierde nada.
- **IGJ y Tasa**: siguen como desplegable porque tienen N/A (3 balances en IGJ, 4 en Tasa). Decisión pendiente: dejarlos así o pasarlos a casilla perdiendo la diferencia "pendiente" vs "no corresponde".
- **Contable — "Legalizado" pasa solo a "Finalizado (en ARCA)"**: pedido sin implementar; falta definir si aplica a la columna Estado o a EECC y si "Legalizado" debe verse antes de pasar.
- **Contable — fórmula de vencimientos** (VTO Balance = cierre + 135 días, VTO 855 = cierre + 160 días): Matías la está consultando aparte, puede cambiar.
- **Texto cortado sin globito**: nombre de cliente y observaciones en la tabla de Contable se cortan con "…" sin mostrar el completo. Ofrecido, no pedido todavía.
- **Reparto de Cartera** (artifact aparte, no está en el repo): faltan cargar 10 clientes de Monotributo sin responsable.
- **Panel General**: filtro por defecto al usuario logueado (Responsable/Liquidadora) — ver memoria del proyecto.

## Hecho recientemente (sep-2026)

- Contable: semáforo de colores (Estado/EECC/Avance) en `contable/semaforo.ts`; EECC suma "Pendiente de pago"; columnas Pedido/Recepción de información con fecha automática; 855/F899/F713 como casilla; ficha de cliente (solo lectura, editable para admin); selector de años solo 2025/2026.
- "La Estrella" (estrella sindical): clave con `identificador` dentro de `claves_acceso` (sin migración).
- Panel General: ventana de confirmación final al dar de baja.
- Modales: arrastrar para seleccionar texto y soltar afuera ya no los cierra (`src/lib/useBackdropClose.ts`).
- Editor de claves: contraseña en su propia fila con botón de copiar.
