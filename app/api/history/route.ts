import { supabaseAdmin } from '../../lib/supabase-admin'
import { limaDate, monthRange } from '../../lib/lima'
import { ok, fail } from '../../lib/api'

export const dynamic = 'force-dynamic'

/** Historial de un mes, un registro por día con sus dos dosis. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams
  const year = parseInt(params.get('year') ?? '', 10)
  const month = parseInt(params.get('month') ?? '', 10) // 0-11

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return fail('Año inválido', 400)
  }
  if (!Number.isInteger(month) || month < 0 || month > 11) {
    return fail('Mes inválido', 400)
  }

  const { start, end } = monthRange(year, month)

  // Con log_date esto es una comparación de fechas exacta. Antes se filtraba por
  // rangos de timestamp construidos en hora local del navegador, que se corrían
  // unas horas en los días del borde del mes.
  const { data, error } = await supabaseAdmin
    .from('pill_logs')
    .select('dose, log_date, taken_at')
    .gte('log_date', start)
    .lte('log_date', end)

  if (error) return fail('No se pudo leer el historial', 500, error)

  const days: Record<string, { date: string; morning: string | null; evening: string | null }> = {}
  const lastDay = Number(end.slice(-2))
  const mm = String(month + 1).padStart(2, '0')

  for (let d = 1; d <= lastDay; d++) {
    const date = `${year}-${mm}-${String(d).padStart(2, '0')}`
    days[date] = { date, morning: null, evening: null }
  }
  for (const log of data) {
    const day = days[log.log_date]
    if (day) day[log.dose as 'morning' | 'evening'] = log.taken_at
  }

  return ok({ today: limaDate(), days: Object.values(days) })
}
