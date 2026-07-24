import { supabaseAdmin, CONFIG_COLUMNS } from '../../lib/supabase-admin'
import { ok, fail } from '../../lib/api'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('reminder_config')
    .select(CONFIG_COLUMNS)
    .eq('id', 1)
    .single()

  if (error) return fail('No se pudo leer la configuración', 500, error)
  return ok(data)
}

/** Un topic de ntfy es un segmento de URL: sin espacios ni barras. */
const TOPIC_RE = /^[A-Za-z0-9_-]{4,64}$/

function intInRange(value: unknown, min: number, max: number): number | null {
  const n = typeof value === 'number' ? value : parseInt(String(value), 10)
  if (!Number.isInteger(n) || n < min || n > max) return null
  return n
}

export async function PUT(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return fail('Cuerpo de la petición inválido', 400)
  }

  const topic = String(body.ntfy_topic ?? '').trim()
  if (!TOPIC_RE.test(topic)) {
    return fail(
      'El topic solo admite letras, números, guiones y guiones bajos (4 a 64 caracteres)',
      400
    )
  }

  const morningHour = intInRange(body.morning_hour, 0, 23)
  const eveningHour = intInRange(body.evening_hour, 0, 23)
  const followup = intInRange(body.followup_minutes, 5, 240)
  const stock = intInRange(body.pill_stock, 0, 10_000)
  const stockAlert = intInRange(body.pill_stock_alert, 0, 10_000)

  if (morningHour === null || eveningHour === null) {
    return fail('Las horas deben estar entre 0 y 23', 400)
  }
  if (morningHour === eveningHour) {
    return fail('Las dos tomas no pueden ser a la misma hora', 400)
  }
  if (followup === null) return fail('El reintento debe estar entre 5 y 240 minutos', 400)
  if (stock === null) return fail('El stock debe ser un número positivo', 400)
  if (stockAlert === null) return fail('El umbral de alerta debe ser un número positivo', 400)

  const { data, error } = await supabaseAdmin
    .from('reminder_config')
    .update({
      ntfy_topic: topic,
      morning_hour: morningHour,
      evening_hour: eveningHour,
      followup_minutes: followup,
      pill_stock: stock,
      pill_stock_alert: stockAlert,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)
    .select(CONFIG_COLUMNS)
    .single()

  if (error) return fail('No se pudo guardar la configuración', 500, error)
  return ok(data)
}
