# NOTES — memoria compartida entre sesiones

Cada sesión (Giuliana / Matías, cualquier cuenta de Claude) deja acá qué hizo y qué quedó pendiente, para que la siguiente no lo tenga que adivinar. Ver reglas en `CLAUDE.md` → "Dos cuentas / dos colaboradores".

## SQL pendiente de correr en Supabase

- **`add_libros_etapa3.sql`** — etapa 3 del módulo Libros. Modifica `libros_pedidos` (estados,
  columnas responsable_id/solicitante), agrega `libros.extraviado`, crea `libros_pedidos_seguimientos`,
  `libros_movimientos`, `libros_incidencias`, `copiadora_facturas`, `copiadora_facturas_tareas`.
  Ya commiteado; falta pegarlo en Supabase Dashboard → SQL Editor.

## Módulo Libros Societarios (rama `libros/modulo`, oct-2026)

Reemplaza el Google Sheet "GESTION DE LIBROS". Se trabaja en la rama `libros/modulo` y se integra a `main` por PR, por etapas (cada una se muestra en el deploy de prueba de la rama antes de seguir):
1. ✅ SQL `add_libros_etapa1.sql` (**corrido** en Supabase el 16-oct): `clientes_societario`, `libros_catalogo` (43 libros cargados), `libros`. Ficha "Societario y libros" en `/libros/clientes/[id]`.
2. ✅ Seguimiento (`/libros`): SQL `add_libros_etapa2.sql` (**corrido** 16-oct: `libros_estados`, `libros_tareas`, `libros_pedidos` — esta última sin pantalla hasta la etapa 3). Cola por cliente (un bloque por cliente y nivel; el nivel es el de su tarea más urgente; subir/bajar renumera `orden_manual` de las tareas abiertas del cliente). Prioridad propuesta por `prioridadSugerida` en `src/lib/libros.ts`; `prioridad_manual` solo si se cambió a mano (con motivo). "Al día" en `libroAlDia`: anual = último cierre con balance vencido (cierre + 135 días), trimestral = último trimestre cerrado hace +30 días, por evento no cuenta; compara por mes. Registrar copiado valida folios antes de escribir y con ≤ 10 folios libres crea `libros_pedidos(tipo='presupuesto_tomo_nuevo', automatico)` (índice único: uno abierto por libro). Antes se corrió también una corrección de la importación (organismo por jurisdicción legal, 50 libros a ubicación cliente, Candela P. como responsable de Libros), fuera del repo por datos de clientes.
3. ⬜ Pedidos y trámites + Entrada y salida.
4. ⬜ Alertas, Configuración (estados, motivos, umbral de folios — hoy fijo en 10, `UMBRAL_FOLIOS` en `src/lib/libros.ts`), mails.
5. ⬜ Panel General (columna LIBROS — hay una rama abierta `rediseno-panel-general`, no tocar antes) + conexión con Contable (`balances.estado` → 'legalizado'/'finalizado', NO `estado_eecc`). Coordinar con Matías el pendiente "Legalizado pasa solo a Finalizado".
6. ✅ Migración desde el sheet (cruce por CUIT) — **adelantada y corrida el 16-oct**: 93 clientes con Libros activo + tipo societario, 342 libros (tomo 1), 27 mandatos. El SQL (`supabase/importar_libros_sheet.sql` + `_control.sql`) y los CSV de origen quedaron **fuera del repo** a pedido (tienen datos de clientes); en la PC de origen están en `.git/info/exclude`. Para revisar a mano en la ficha: último copiado con fecha futura en CUSTOMCOFFEE (Libro de Actas, 31/12/2026) y METALURGICA PINTARELLI (Inv. y Balance, 01/11/2026); CISEC y RODBALL tenían "B2025-2026" / "2026 renovación cargos" y se cargaron como 2026; 3 mandatos solo traían el año (se cargó 01/01, con nota en observaciones).

Clientes del módulo = `servicios_cliente(servicio='libros', estado=true)` (se activa desde Panel General → Editar).

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
  Cuando `rediseno-panel-general` se integre a `main`, esta sección deberá portarse
  a lo que ese rediseño use en lugar de `FichaClienteBoton.tsx` (que ese branch elimina).
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
