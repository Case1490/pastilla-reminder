import { describe, it, expect } from 'vitest'
import { dueReminders, type DoseConfig, type PillLogRow } from './logic'

// Lima es UTC-5 fijo, así que una hora HH de Lima es (HH+5) en UTC. Los `now` de
// abajo se escriben en UTC (con sufijo Z) y el comentario indica la hora de Lima.

const CONFIG: DoseConfig = { morning_hour: 8, evening_hour: 20, followup_minutes: 30 }

function log(over: Partial<PillLogRow>): PillLogRow {
  return {
    dose: 'morning',
    log_date: '2026-07-24',
    taken_at: null,
    last_notified_at: null,
    notify_count: 0,
    ...over,
  }
}

describe('dueReminders', () => {
  it('antes de la hora de la dosis no manda nada', () => {
    const now = new Date('2026-07-24T12:00:00Z') // 07:00 Lima
    expect(dueReminders(now, CONFIG, [])).toEqual([])
  })

  it('a la hora exacta y sin registro previo, primer aviso', () => {
    const now = new Date('2026-07-24T13:00:00Z') // 08:00 Lima
    const due = dueReminders(now, CONFIG, [])
    expect(due).toHaveLength(1)
    expect(due[0]).toMatchObject({ dose: 'morning', logDate: '2026-07-24', attempt: 1 })
    expect(due[0].scheduledTime).toBe('2026-07-24T08:00:00-05:00')
  })

  it('no reintenta antes de que pase followup_minutes', () => {
    const now = new Date('2026-07-24T13:15:00Z') // 08:15 Lima, 15 min tras el aviso
    const logs = [log({ notify_count: 1, last_notified_at: '2026-07-24T13:00:00Z' })]
    expect(dueReminders(now, CONFIG, logs)).toEqual([])
  })

  it('reintenta cuando ya pasó followup_minutes, incrementando el intento', () => {
    const now = new Date('2026-07-24T13:35:00Z') // 08:35 Lima, 35 min tras el aviso
    const logs = [log({ notify_count: 1, last_notified_at: '2026-07-24T13:00:00Z' })]
    const due = dueReminders(now, CONFIG, logs)
    expect(due).toHaveLength(1)
    expect(due[0].attempt).toBe(2)
  })

  it('deja de insistir tras MAX_NOTIFICATIONS', () => {
    const now = new Date('2026-07-24T14:00:00Z') // 09:00 Lima, dentro de ventana
    const logs = [log({ notify_count: 4, last_notified_at: '2026-07-24T13:30:00Z' })]
    expect(dueReminders(now, CONFIG, logs)).toEqual([])
  })

  it('no avisa si la dosis ya fue tomada', () => {
    const now = new Date('2026-07-24T13:35:00Z') // 08:35 Lima
    const logs = [log({ notify_count: 1, taken_at: '2026-07-24T13:10:00Z' })]
    expect(dueReminders(now, CONFIG, logs)).toEqual([])
  })

  it('no avisa una vez cerrada la ventana de 4h', () => {
    const now = new Date('2026-07-24T17:30:00Z') // 12:30 Lima, 4.5h tras las 08:00
    expect(dueReminders(now, CONFIG, [])).toEqual([])
  })

  it('durante el día solo evalúa la ocurrencia de hoy, no la de ayer', () => {
    const now = new Date('2026-07-25T01:15:00Z') // 20:15 Lima del 24
    const due = dueReminders(now, CONFIG, [])
    expect(due).toHaveLength(1)
    expect(due[0]).toMatchObject({ dose: 'evening', logDate: '2026-07-24', attempt: 1 })
  })

  // El caso que arreglamos: con la dosis nocturna a las 22:00, su ventana se mete
  // en la madrugada del día siguiente. Antes, tras medianoche, se perdía.
  it('sigue insistiendo tras medianoche con la cola de la dosis de anoche', () => {
    const nightConfig: DoseConfig = { ...CONFIG, evening_hour: 22 }
    const now = new Date('2026-07-25T05:30:00Z') // 00:30 Lima del 25
    const logs = [
      log({
        dose: 'evening',
        log_date: '2026-07-24', // la toma de anoche
        notify_count: 2,
        last_notified_at: '2026-07-25T04:30:00Z', // 23:30 Lima, hace 60 min
      }),
    ]
    const due = dueReminders(now, nightConfig, logs)
    expect(due).toHaveLength(1)
    expect(due[0]).toMatchObject({ dose: 'evening', logDate: '2026-07-24', attempt: 3 })
    expect(due[0].scheduledTime).toBe('2026-07-24T22:00:00-05:00')
  })

  it('con la config actual (20:00) la ventana cierra a medianoche y no revive tras las 00:00', () => {
    const now = new Date('2026-07-25T05:30:00Z') // 00:30 Lima del 25
    const logs = [log({ dose: 'evening', log_date: '2026-07-24', notify_count: 1 })]
    // 20:00 Lima del 24 + 4h = 00:00 Lima del 25; a las 00:30 la ventana ya cerró.
    expect(dueReminders(now, CONFIG, logs)).toEqual([])
  })
})
