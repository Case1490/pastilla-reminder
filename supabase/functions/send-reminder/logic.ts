// Lógica pura de decisión de recordatorios, separada del I/O para poder testearla.
// La importan index.ts (Deno) y el test (Vitest), así que no usa APIs de Deno,
// red ni imports remotos: entra `now` + config + logs, sale la lista de avisos.

export const TZ = 'America/Lima'
export const TZ_OFFSET = '-05:00' // Perú no tiene horario de verano
export const WINDOW_MINUTES = 4 * 60 // tras 4h sin confirmar, se deja de insistir
export const MAX_NOTIFICATIONS = 4 // aviso inicial + 3 reintentos

export interface DoseConfig {
  morning_hour: number
  evening_hour: number
  followup_minutes: number
}

export interface PillLogRow {
  dose: 'morning' | 'evening'
  log_date: string
  taken_at: string | null
  last_notified_at: string | null
  notify_count: number
}

export interface DueReminder {
  dose: 'morning' | 'evening'
  logDate: string
  scheduledTime: string
  attempt: number
  label: string
  emoji: string
}

/**
 * Fecha y hora del reloj en Lima para un instante dado.
 *
 * La versión anterior hacía `new Date(d.toLocaleString('en-US', {timeZone}))` y
 * luego `.toISOString()`, que aplica el desfase dos veces: el runtime corre en
 * UTC, así que entre las 19:00 y la medianoche de Lima calculaba el día
 * siguiente y buscaba el log equivocado.
 */
export function limaParts(d: Date): { date: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (type: string) => parts.find(p => p.type === type)!.value
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
  }
}

/** Fecha calendario en Lima desplazada `deltaDays` días. Perú no tiene DST, así
 *  que sumar/restar 24h siempre cae en el día calendario esperado. */
export function limaDateOffset(d: Date, deltaDays: number): string {
  return limaParts(new Date(d.getTime() + deltaDays * 86_400_000)).date
}

/**
 * Decide qué recordatorios toca enviar en el instante `now`. No manda nada ni
 * toca la base: solo devuelve la lista, para poder testear el cruce de
 * medianoche y los reintentos sin red ni Supabase.
 *
 * Cada dosis se evalúa en su ocurrencia de ayer y la de hoy. El instante
 * programado es absoluto, así que la ventana se mide en tiempo real y cruzar la
 * medianoche deja de importar: antes, tras las 00:00, la cola de la toma
 * nocturna caía como `elapsed` negativo y se dejaba de insistir.
 */
export function dueReminders(now: Date, config: DoseConfig, logs: PillLogRow[]): DueReminder[] {
  const today = limaParts(now).date
  const yesterday = limaDateOffset(now, -1)

  const doses = [
    { dose: 'morning' as const, hour: config.morning_hour, label: 'mañana', emoji: '🌅' },
    { dose: 'evening' as const, hour: config.evening_hour, label: 'noche', emoji: '🌙' },
  ]

  const due: DueReminder[] = []

  for (const d of doses) {
    for (const date of [yesterday, today]) {
      const scheduledTime = `${date}T${String(d.hour).padStart(2, '0')}:00:00${TZ_OFFSET}`
      const elapsed = (now.getTime() - new Date(scheduledTime).getTime()) / 60000
      if (elapsed < 0) continue // todavía no es la hora
      if (elapsed > WINDOW_MINUTES) continue // la ventana ya cerró

      const log = logs.find(l => l.dose === d.dose && l.log_date === date)
      if (log?.taken_at) continue
      if ((log?.notify_count ?? 0) >= MAX_NOTIFICATIONS) continue

      // El reintento se mide contra el último aviso real, no contra la grilla
      // del cron, así que no depende de que las corridas caigan exactas.
      if (log?.last_notified_at) {
        const sinceLast = (now.getTime() - new Date(log.last_notified_at).getTime()) / 60000
        if (sinceLast < config.followup_minutes) continue
      }

      due.push({
        dose: d.dose,
        logDate: date,
        scheduledTime,
        attempt: (log?.notify_count ?? 0) + 1,
        label: d.label,
        emoji: d.emoji,
      })
    }
  }

  return due
}
