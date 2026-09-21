# NOTES — memoria compartida entre sesiones

Cada sesión (Giuliana / Matías, cualquier cuenta de Claude) deja acá qué hizo y qué quedó pendiente, para que la siguiente no lo tenga que adivinar. Ver reglas en `CLAUDE.md` → "Dos cuentas / dos colaboradores".

## SQL pendiente de correr en Supabase

_(nada pendiente — todo lo anterior ya fue corrido)_

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
