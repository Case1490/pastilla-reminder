// Todo el dominio de la app vive en hora de Lima: el día "de hoy" para saber si
// tocó la pastilla, y las horas de las dosis. El servidor puede estar en UTC, así
// que ninguna conversión puede depender de la zona horaria del proceso.

export const TZ = 'America/Lima'

// Perú no aplica horario de verano desde 1994, así que el offset es constante.
export const TZ_OFFSET = '-05:00'

/** Fecha calendario en Lima, formato YYYY-MM-DD. */
export function limaDate(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const get = (type: string) => parts.find(p => p.type === type)!.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Hora y minuto del reloj en Lima. */
export function limaClock(d: Date = new Date()): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (type: string) => Number(parts.find(p => p.type === type)!.value)
  // hourCycle h23 puede devolver 24 a la medianoche en algunos runtimes.
  return { hour: get('hour') % 24, minute: get('minute') }
}

/** Instante ISO de una hora concreta de un día concreto, en Lima. */
export function limaInstant(date: string, hour: number, minute = 0): string {
  const hh = String(hour).padStart(2, '0')
  const mm = String(minute).padStart(2, '0')
  return `${date}T${hh}:${mm}:00${TZ_OFFSET}`
}

/** Primer y último día del mes, como YYYY-MM-DD. */
export function monthRange(year: number, month: number): { start: string; end: string } {
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const mm = String(month + 1).padStart(2, '0')
  return {
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${String(last).padStart(2, '0')}`,
  }
}
