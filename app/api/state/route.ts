import { supabaseAdmin, CONFIG_COLUMNS } from '../../lib/supabase-admin'
import { limaDate } from '../../lib/lima'
import { ok, fail } from '../../lib/api'

export const dynamic = 'force-dynamic'

/** Estado de hoy: qué dosis se tomaron y la configuración vigente. */
export async function GET() {
  const today = limaDate()

  const [logs, config] = await Promise.all([
    supabaseAdmin
      .from('pill_logs')
      .select('dose, log_date, taken_at')
      .eq('log_date', today),
    supabaseAdmin
      .from('reminder_config')
      .select(CONFIG_COLUMNS)
      .eq('id', 1)
      .single(),
  ])

  if (logs.error) return fail('No se pudo leer el registro de hoy', 500, logs.error)
  if (config.error) return fail('No se pudo leer la configuración', 500, config.error)

  return ok({
    today,
    config: config.data,
    logs: {
      morning: logs.data.find(l => l.dose === 'morning') ?? null,
      evening: logs.data.find(l => l.dose === 'evening') ?? null,
    },
  })
}
