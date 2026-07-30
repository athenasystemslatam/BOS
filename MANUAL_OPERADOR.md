# Manual del Operador — BOS · KMA Consultores

Este documento explica cómo mantener y modificar el sistema BOS desde cualquier dispositivo y ubicación. No hace falta ser programador, pero sí tener los accesos necesarios y seguir los pasos con cuidado.

---

## Accesos necesarios

Antes de arrancar, asegurate de tener usuario y contraseña (o acceso compartido) en los siguientes servicios:

| Servicio | Para qué se usa | URL |
|---|---|---|
| **GitHub** | Repositorio del código | github.com/athenasystemslatam/BOS |
| **Vercel** | Hosting y deploy del sistema | vercel.com |
| **Supabase** | Base de datos | supabase.com |
| **Resend** | Envío de emails | resend.com |
| **Google Cloud Console** | Cuenta de servicio de Drive | console.cloud.google.com |

Si no tenés acceso a alguno, pedíselo a Athena Systems (athenasystems.latam@gmail.com).

---

## Cómo iniciar Claude Code (el asistente que desarrolla el sistema)

BOS fue desarrollado y se mantiene con **Claude Code**, un asistente de inteligencia artificial que conoce el proyecto y puede hacer cambios en el código, explicar cómo funciona algo, o ayudar a resolver problemas.

### Opción A — Desde la aplicación de escritorio (más fácil)

1. Descargá e instalá **Claude Code Desktop** desde: https://claude.ai/download
2. Abrí la aplicación
3. Cuando te pida una carpeta, abrí la carpeta del proyecto BOS (clonada desde GitHub, ver más abajo)

### Opción B — Desde la terminal

```bash
# Instalar Claude Code (una sola vez)
npm install -g @anthropic/claude-code

# Clonar el repositorio (una sola vez por máquina)
git clone https://github.com/athenasystemslatam/BOS
cd BOS

# Iniciar Claude Code
claude
```

---

## Cómo recuperar el contexto del proyecto

Cuando abrís Claude Code en la carpeta de BOS, **automáticamente lee el archivo `CLAUDE.md`** que está en el repositorio. Ese archivo le dice todo lo que necesita saber: cómo está armado el sistema, qué reglas seguir, el estado actual del proyecto.

No hace falta explicarle nada de cero. Con decirle algo como:

> "Retomá el proyecto BOS. Revisá el CLAUDE.md y contame en qué estado está."

Ya está orientado y listo para trabajar.

Si querés darle más contexto de conversaciones anteriores, podés decirle:

> "Leé el CLAUDE.md, el README.md y el MANUAL_OPERADOR.md para entender el proyecto completo."

---

## Tipos de cambios y cómo pedirlos

### Cambios en el sistema (código)

Simplemente describís lo que querés en lenguaje natural. Ejemplos:

> "Quiero que en la pantalla de seguimiento aparezca una columna nueva para registrar si el cliente tiene obras sociales."

> "El email de alerta que se manda a las liquidadoras tiene un error de tipeo. Dice 'vencimienro' en vez de 'vencimiento', arreglalo."

> "Cuando una empresa pasa a estado inactivo, quiero que aparezca un aviso de confirmación antes de guardar."

Claude Code va a hacer los cambios en el código y pedirte confirmación antes de subirlos a producción.

**Regla importante:** Claude siempre te avisa antes de subir cambios a producción (git push). Vos tenés que decir "pushea" o "dale" para que lo haga. Nunca lo hace solo.

### Cambios en la base de datos (SQL)

Para agregar columnas, crear tablas o modificar la estructura de datos, Claude genera el SQL y vos lo corrés manualmente en Supabase:

1. Claude te da el SQL a ejecutar
2. Entrás a **supabase.com** → tu proyecto → **SQL Editor**
3. Pegás el SQL y hacés click en **Run**
4. Le avisás a Claude el resultado ("Success" o el error que apareció)

### Cambios de configuración

**Variables de entorno** (claves de API, emails, etc.):
1. Entrás a **vercel.com** → proyecto BOS → **Settings → Environment Variables**
2. Editás o agregás la variable
3. Hacés un nuevo deploy (o esperás al próximo push automático)

**Cambiar el email desde donde llegan las alertas:**
Cuando esté configurado el dominio propio en Resend, pedirle a Claude:
> "Cambiá el FROM de los emails a notificaciones@tudominio.com"

### Ver logs y diagnosticar problemas

**Logs de producción:** vercel.com → proyecto BOS → **Logs**

**Logs de Drive sync:** En seguimiento, el Drive sync corre automáticamente todos los días. Si algo no se detecta, podés pedirle a Claude que revise los logs o use el endpoint de debug.

**Datos en la base:** supabase.com → proyecto → **Table Editor** para ver las tablas directamente.

---

## Flujo de un cambio típico (paso a paso)

1. Abrís Claude Code en la carpeta del proyecto
2. Describís el cambio que querés
3. Claude analiza el código, hace los cambios y te muestra qué modificó
4. Si hay SQL, te lo da para que lo corras en Supabase
5. Decís "pushea" para que suba el cambio a GitHub
6. Vercel detecta el push y despliega automáticamente (tarda ~2 minutos)
7. El cambio está en producción: https://bos-plum.vercel.app

---

## Estructura del repositorio (para orientarse)

```
BOS/
├── src/
│   ├── app/
│   │   ├── (dashboard)/
│   │   │   ├── seguimiento/     # Pantalla principal de seguimiento
│   │   │   ├── empresas/        # ABM de empresas y reasignaciones
│   │   │   ├── liquidadoras/    # Gestión de liquidadoras
│   │   │   ├── dashboard/       # Métricas generales
│   │   │   ├── productividad/   # KPIs por liquidadora
│   │   │   └── vencimientos/    # Calendario de vencimientos F.931
│   │   └── api/
│   │       ├── cron/            # Endpoints que llama GitHub Actions
│   │       └── alertas/         # Endpoint de alertas F.931
│   └── lib/
│       ├── drive.ts             # Toda la lógica de Google Drive
│       ├── email.ts             # Alertas por email
│       └── vencimientos.ts      # Cálculo de vencimientos F.931
├── supabase/                    # Migraciones SQL (para correr en Supabase)
├── .github/workflows/           # Cron jobs automáticos
├── CLAUDE.md                    # Contexto para Claude Code (no tocar)
├── README.md                    # Documentación técnica completa
└── MANUAL_LIQUIDADORAS.md       # Manual para las liquidadoras
```

---

## Preguntas frecuentes

**¿Qué pasa si Claude Code no reconoce el proyecto?**  
Asegurate de estar en la carpeta correcta (donde está el archivo `CLAUDE.md`). Si sigue sin reconocerlo, decile: "Leé el CLAUDE.md y el README.md para entender el proyecto."

**¿Puedo hacer cambios desde el celular?**  
Claude Code Desktop requiere computadora. Desde el celular podés acceder a Supabase, Vercel y GitHub para ver datos y logs, pero para modificar código necesitás una computadora.

**¿Cómo sé si un cambio llegó a producción?**  
Entrá a vercel.com → proyecto BOS → **Deployments**. El último deploy muestra cuándo fue y si fue exitoso. También podés entrar al sistema en https://bos-plum.vercel.app y verificar el cambio directamente.

**¿Qué hago si el sistema da un error en producción?**  
1. Revisá los logs en Vercel
2. Abrí Claude Code y describí el error: "El sistema está dando este error: [pegar el error]"
3. Claude va a diagnosticar y proponer una solución

**¿Cómo agrego una nueva liquidadora al sistema?**  
No requiere código. Desde el sistema mismo: entrá como admin → **Liquidadoras** → **Nueva liquidadora**. Completá nombre y email, el sistema le manda el acceso por magic link.

**¿Cómo agrego una nueva empresa?**  
Desde el sistema: admin → **Empresas** → **Nueva empresa**. Completá el formulario con CUIT, liquidadora asignada y configuración.

---

## Contacto

Sistema desarrollado y mantenido por **Athena Systems**  
Email: athenasystems.latam@gmail.com  
Para soporte técnico, cambios o accesos, contactar directamente.
