import { supabaseAdmin } from '../../lib/supabase-admin'
import { limaDate, limaInstant } from '../../lib/lima'
import { ok, fail } from '../../lib/api'

export const dynamic = 'force-dynamic'

/**
 * Confirma una dosis. El insert del log y el descuento del stock ocurren dentro
 * de confirm_dose(), en una sola transacción, para que no se pueda descontar una
 * pastilla sin haber registrado la toma — que es justo lo que venía pasando.
 */
export async function POST(req: Request) {
  let dose: unknown
  try {
    ;({ dose } = await req.json())
  } catch {
    return fail('Cuerpo de la petición inválido', 400)
  }

  if (dose !== 'morning' && dose !== 'evening') {
    return fail('Dosis inválida', 400)
  }

  const config = await supabaseAdmin
    .from('reminder_config')
    .select('morning_hour, evening_hour')
    .eq('id', 1)
    .single()

  if (config.error) return fail('No se pudo leer la configuración', 500, config.error)

  const today = limaDate()
  const hour = dose === 'morning' ? config.data.morning_hour : config.data.evening_hour

  const { data, error } = await supabaseAdmin.rpc('confirm_dose', {
    p_dose: dose,
    p_log_date: today,
    p_scheduled: limaInstant(today, hour),
    p_taken: new Date().toISOString(),
  })

  if (error) return fail('No se pudo registrar la toma', 500, error)

  return ok(data)
}
