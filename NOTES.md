# NOTES — memoria compartida entre sesiones

Cada sesión (Giuliana / Matías, cualquier cuenta de Claude) deja acá qué hizo y qué quedó pendiente, para que la siguiente no lo tenga que adivinar. Ver reglas en `CLAUDE.md` → "Dos cuentas / dos colaboradores".

## SQL pendiente de correr en Supabase

_(nada pendiente — todo lo anterior ya fue corrido)_

## Módulo Libros Societarios (rama `libros/modulo`, oct-2026)

Reemplaza el Google Sheet "GESTION DE LIBROS". Se trabaja en la rama `libros/modulo` y se integra a `main` por PR, por etapas (cada una se muestra en el deploy de prueba de la rama antes de seguir):
1. ✅ SQL `add_libros_etapa1.sql` (**corrido** en Supabase el 16-oct): `clientes_societario`, `libros_catalogo` (43 libros cargados), `libros`. Ficha "Societario y libros" en `/libros/clientes/[id]`.
2. ⬜ Seguimiento: cola P1/P2/P3 con orden manual, registrar copiado, historial, folios.
3. ⬜ Pedidos y trámites + Entrada y salida.
4. ⬜ Alertas, Configuración (estados, motivos, umbral de folios — hoy fijo en 10, `UMBRAL_FOLIOS` en `src/lib/libros.ts`), mails.
5. ⬜ Panel General (columna LIBROS — hay una rama abierta `rediseno-panel-general`, no tocar antes) + conexión con Contable (`balances.estado` → 'legalizado'/'finalizado', NO `estado_eecc`). Coordinar con Matías el pendiente "Legalizado pasa solo a Finalizado".
6. ⬜ Migración desde el sheet (cruce por CUIT).

Clientes del módulo = `servicios_cliente(servicio='libros', estado=true)` (se activa desde Panel General → Editar).

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
