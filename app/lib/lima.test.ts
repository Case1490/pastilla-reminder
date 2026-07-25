import { describe, it, expect } from 'vitest'
import { limaDate, limaInstant, monthRange } from './lima'

// Lima es UTC-5 fijo (Perú no tiene horario de verano), así que la medianoche de
// Lima cae a las 05:00 UTC. Estas pruebas fijan justo ese borde, que es donde
// vivían los bugs de "hoy" equivocado.

describe('limaDate', () => {
  it('devuelve el día calendario de Lima para un instante diurno', () => {
    expect(limaDate(new Date('2026-07-23T15:00:00Z'))).toBe('2026-07-23') // 10:00 Lima
  })

  it('una toma nocturna sigue siendo del mismo día aunque en UTC ya sea el siguiente', () => {
    // 02:00 UTC del 24 = 21:00 Lima del 23. El día natural de la dosis es el 23.
    expect(limaDate(new Date('2026-07-24T02:00:00Z'))).toBe('2026-07-23')
  })

  it('un minuto antes de medianoche en Lima todavía es el día en curso', () => {
    // 04:59 UTC del 24 = 23:59 Lima del 23.
    expect(limaDate(new Date('2026-07-24T04:59:00Z'))).toBe('2026-07-23')
  })

  it('a las 05:00 UTC ya cambió el día en Lima (medianoche exacta)', () => {
    expect(limaDate(new Date('2026-07-24T05:00:00Z'))).toBe('2026-07-24')
  })

  it('cruza bien el fin de mes', () => {
    // 03:00 UTC del 1 de agosto = 22:00 Lima del 31 de julio.
    expect(limaDate(new Date('2026-08-01T03:00:00Z'))).toBe('2026-07-31')
  })
})

describe('limaInstant', () => {
  it('construye el ISO con el offset de Lima y rellena con ceros', () => {
    expect(limaInstant('2026-07-24', 8)).toBe('2026-07-24T08:00:00-05:00')
    expect(limaInstant('2026-07-24', 20, 30)).toBe('2026-07-24T20:30:00-05:00')
  })

  it('el instante equivale al UTC correcto (20:00 Lima = 01:00 UTC del día siguiente)', () => {
    expect(new Date(limaInstant('2026-07-24', 20)).toISOString()).toBe('2026-07-25T01:00:00.000Z')
  })
})

describe('monthRange', () => {
  it('primer y último día de un mes de 31', () => {
    expect(monthRange(2026, 6)).toEqual({ start: '2026-07-01', end: '2026-07-31' }) // julio
  })

  it('febrero no bisiesto termina el 28', () => {
    expect(monthRange(2026, 1)).toEqual({ start: '2026-02-01', end: '2026-02-28' })
  })

  it('febrero bisiesto termina el 29', () => {
    expect(monthRange(2024, 1)).toEqual({ start: '2024-02-01', end: '2024-02-29' })
  })

  it('diciembre no se desborda al año siguiente', () => {
    expect(monthRange(2026, 11)).toEqual({ start: '2026-12-01', end: '2026-12-31' })
  })
})
