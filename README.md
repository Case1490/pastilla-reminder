# Recordatorio de pastillas

App personal para el seguimiento de la medicación diaria de Irma: media pastilla
por la mañana y media por la noche. Registra cada toma, lleva la cuenta del stock
restante y envía recordatorios al celular por [ntfy](https://ntfy.sh).

- **Next.js 16** (App Router) sobre **Supabase** (Postgres + Edge Functions)
- Notificaciones push vía ntfy, sin necesidad de cuenta ni servidor propio
- Instalable como PWA

## Cómo funciona

| Pieza | Rol |
| --- | --- |
| `app/page.tsx` | Pantalla principal: confirmar las dos tomas del día |
| `app/history` | Historial mensual y porcentaje de cumplimiento |
| `app/settings` | Canal ntfy, horarios, reintento y stock |
| `app/api/*` | Route handlers; **todo** el acceso a la base pasa por aquí |
| `supabase/functions/send-reminder` | Edge Function que decide y envía los avisos |
| `supabase/migrations` | Esquema versionado |

### El modelo de datos

`reminder_config` es una única fila (`id = 1`) con la configuración. `pill_logs`
guarda una fila por dosis y día, con un índice único sobre `(dose, log_date)`.

`log_date` es la fecha calendario **en Lima**, escrita explícitamente por el
servidor. Existe porque el día natural de una toma no coincide con el día UTC: la
dosis de las 20:00 de Lima cae al día siguiente en UTC. Todos los filtros del
historial y de "hoy" van contra esa columna.

El stock se cuenta en **mitades**, no en pastillas: cada toma descuenta 1. Diez
pastillas son 20 de stock.

### Seguridad

Las dos tablas tienen RLS activo y ninguna política, así que las llaves `anon` y
`authenticated` no tienen acceso. Las lecturas y escrituras las hace el servidor
con la `service_role`, que hace bypass de RLS y nunca sale del backend.

La app no tiene login: quien tenga la URL puede usarla. Eso es deliberado para un
uso doméstico, pero significa que la URL de despliegue no debería compartirse.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # y rellenar los valores
npm run dev
```

En http://localhost:3000.

### Base de datos

```bash
npx supabase login
npx supabase link --project-ref TU_PROJECT_REF
npx supabase db push
```

### Edge Function

```bash
npx supabase functions deploy send-reminder
```

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` las inyecta Supabase sola; no hay
que configurar secretos.

### Recordatorios automáticos

Sin esto la app funciona, pero **no avisa nada**. Hay que ejecutar
[`supabase/setup-cron.sql`](supabase/setup-cron.sql) una vez desde el SQL Editor
del dashboard; el propio archivo explica los dos pasos.

Programa `pg_cron` para invocar la Edge Function cada 15 minutos. En cada corrida
la función mira, para cada dosis: si ya pasó la hora, si no está confirmada y si
toca reintentar según `followup_minutes`. Insiste hasta 4 veces y deja de hacerlo
4 horas después de la hora prevista. Es idempotente, así que ejecutarla de más no
duplica avisos.

### Notificaciones en el celular

1. Instalar la app **ntfy** (Android / iOS).
2. Suscribirse a un topic con un nombre difícil de adivinar — los topics de
   ntfy.sh son públicos para quien conozca el nombre.
3. Poner ese mismo nombre en Configuración y usar "Enviar notificación de prueba".

## Pruebas

```bash
npm test
```

Cubre con [Vitest](https://vitest.dev) las dos zonas donde ya hubo bugs de fecha:
`app/lib/lima.ts` (conversión de zona horaria y rangos de mes) y la decisión de
qué recordatorio enviar, extraída a `supabase/functions/send-reminder/logic.ts`
como función pura para poder probar el cruce de medianoche y los reintentos sin
red ni base de datos.

## Despliegue

```bash
npx vercel
```

Configurar en Vercel las mismas dos variables de `.env.local`. La Edge Function y
el cron viven en Supabase, así que son independientes del despliegue del front.
