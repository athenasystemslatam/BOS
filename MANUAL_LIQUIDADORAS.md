# Manual de uso — BOS · Módulo Sueldos

Sistema de seguimiento de liquidaciones de KMA Consultores.  
**Dirección:** https://bos-plum.vercel.app

---

## Cómo ingresar

El sistema no tiene contraseña. El acceso es por **link de un solo uso** que llega al email.

1. Entrá a https://bos-plum.vercel.app
2. Escribí tu email y hacé click en **Enviar link**
3. Revisá tu bandeja de entrada y hacé click en el link que llega
4. Listo — el sistema te recuerda en ese navegador, no hace falta repetirlo todos los días

> Si el link no llega en un par de minutos, revisá la carpeta de spam.  
> El link expira en 1 hora; si expiró, volvé al paso 1 y pedí uno nuevo.

---

## La pantalla principal: Seguimiento

Al entrar vas a ver la pantalla de **Seguimiento**, que muestra todas tus empresas del mes actual.

Las empresas están ordenadas por terminación de CUIT, que coincide con el orden de vencimiento del F.931 (las que vencen primero aparecen arriba).

### Columnas

| Columna | Qué significa |
|---|---|
| **Rec Q1** | Recibos de primera quincena (solo aparece en empresas quincenales) |
| **Recibos** | Recibos de sueldos del mes |
| **F.931** | Presentación de cargas sociales (AFIP) |
| **Bol. sind.** | Boleta sindical (solo en empresas con sindicato) |
| **Rúb. LSD** | Rúbrica del libro de sueldos digital |
| **SAC** | Aguinaldo (solo en junio y diciembre) |

### Cómo marcar una tarea

Hacé click en el checkbox de la columna correspondiente cuando terminaste esa tarea. Se guarda automáticamente, no hace falta hacer nada más.

### El color celeste

Si un checkbox aparece marcado con **fondo celeste**, significa que el sistema lo detectó automáticamente porque encontró el archivo en Google Drive. No lo marcaste vos — lo hizo el sistema solo.

Si el checkbox está marcado sin color de fondo, lo marcaste vos manualmente.

---

## Observaciones y recordatorios

En cada empresa hay dos campos de texto:

- **Observaciones**: una nota para el mes actual (queda guardada pero no pasa al mes siguiente)
- **→ Sig. mes**: lo que escribas acá va a aparecer como alerta destacada en el mes siguiente. Útil para anotar cosas pendientes o avisos importantes

---

## La llave de claves

El ícono de llave al lado del nombre de cada empresa abre un panel con las claves de acceso: AFIP, sistema de sueldos, portales, etc.

Hacé click en el ícono de copiar al lado de cada dato para copiarlo al portapapeles.

---

## Cambiar de mes

En la parte superior de Seguimiento hay un selector de mes. Podés usarlo para ver o editar períodos anteriores.

> Modificar un período ya cerrado genera un registro de alerta que queda visible para el admin.

---

## El Dashboard

La pantalla de **Dashboard** muestra un resumen del mes: cuántas empresas están completas, cuántas en proceso, y el avance por liquidadora.

También muestra los grupos de vencimiento del F.931 con los días que faltan para cada uno.

---

## Preguntas frecuentes

**¿Tengo que marcar algo si Drive ya lo detectó?**  
No. Si el checkbox ya está marcado (aunque sea por Drive), la tarea está registrada.

**¿Puedo marcar aunque el archivo todavía no esté en Drive?**  
Sí. Podés marcar manualmente en cualquier momento. Si después el sistema detecta el archivo en Drive, queda registrado por los dos lados.

**¿El mes cambia solo?**  
Sí. El sistema detecta automáticamente qué mes corresponde trabajar según los vencimientos del F.931. No hace falta hacer nada para que cambie.

**¿Qué hago si algo no funciona o hay un error?**  
Avisá a Giuliana o al equipo de Athena Systems (athenasystems.latam@gmail.com).

---

*BOS — KMA Consultores · Desarrollado por Athena Systems*
