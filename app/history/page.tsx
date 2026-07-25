'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { TZ } from '../lib/lima'

interface Day {
  date: string
  morning: string | null
  evening: string | null
}

export default function History() {
  const [days, setDays] = useState<Day[]>([])
  const [today, setToday] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cursor, setCursor] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/history?year=${cursor.year}&month=${cursor.month}`, {
          cache: 'no-store',
        })
        const body = await res.json()
        if (!res.ok) throw new Error(body.error ?? 'No se pudo cargar el historial')
        if (cancelled) return
        setDays(body.days)
        setToday(body.today)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'No se pudo cargar el historial')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [cursor])

  const shift = (delta: number) =>
    setCursor(c => {
      const d = new Date(c.year, c.month + delta)
      return { year: d.getFullYear(), month: d.getMonth() }
    })

  // Solo cuentan los días ya transcurridos: los futuros no son incumplimiento.
  const past = days.filter(d => d.date <= today)
  const total = past.length * 2
  const taken = past.reduce((n, d) => n + (d.morning ? 1 : 0) + (d.evening ? 1 : 0), 0)
  const pct = total > 0 ? Math.round((taken / total) * 100) : 0

  const monthLabel = new Date(cursor.year, cursor.month).toLocaleDateString('es-PE', {
    month: 'long',
    year: 'numeric',
  })

  const isCurrentMonth =
    cursor.year === new Date().getFullYear() && cursor.month === new Date().getMonth()

  return (
    <main className="screen">
      <div className="stack fade">
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" className="link">
            ← Volver
          </Link>
          <p className="eyebrow">Historial</p>
          <span style={{ width: '3.5rem' }} />
        </header>

        {error && (
          <div className="alert alert--danger" role="alert">
            {error}
          </div>
        )}

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1.15rem' }}>
          <span
            style={{
              fontSize: '2.75rem',
              fontWeight: 300,
              letterSpacing: '-0.03em',
              lineHeight: 1,
              color: pct >= 80 ? 'var(--accent)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)',
            }}
          >
            {pct}
            <span style={{ fontSize: '1.35rem' }}>%</span>
          </span>
          <div>
            <p style={{ fontSize: '0.85rem' }}>Cumplimiento</p>
            <p className="hint">
              {taken} de {total} dosis
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button className="btn btn--inline" onClick={() => shift(-1)} aria-label="Mes anterior">
            ‹
          </button>
          <p className="label" style={{ textTransform: 'capitalize' }}>
            {monthLabel}
          </p>
          <button
            className="btn btn--inline"
            onClick={() => shift(1)}
            disabled={isCurrentMonth}
            aria-label="Mes siguiente"
          >
            ›
          </button>
        </div>

        {loading ? (
          <p className="hint" style={{ textAlign: 'center', padding: '2rem 0' }}>
            Cargando…
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {days.map(day => (
              <DayRow key={day.date} day={day} today={today} />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

function DayRow({ day, today }: { day: Day; today: string }) {
  const isToday = day.date === today
  const isPast = day.date < today

  const label = new Date(`${day.date}T12:00:00`).toLocaleDateString('es-PE', {
    weekday: 'short',
    day: 'numeric',
  })

  const slotState = (takenAt: string | null) =>
    takenAt ? 'taken' : isPast ? 'missed' : 'pending'

  const fmt = (takenAt: string | null) =>
    takenAt
      ? new Date(takenAt).toLocaleTimeString('es-PE', {
          timeZone: TZ,
          hour: '2-digit',
          minute: '2-digit',
        })
      : isPast
        ? 'Omitida'
        : '—'

  return (
    <div className="day" data-today={isToday}>
      <p
        className="hint"
        style={{
          width: '3.25rem',
          flexShrink: 0,
          textTransform: 'capitalize',
          color: isToday ? 'var(--accent)' : undefined,
        }}
      >
        {label}
      </p>

      <div style={{ flex: 1, display: 'flex', gap: '0.5rem' }}>
        {(['morning', 'evening'] as const).map(dose => (
          <div key={dose} className="day__slot" data-state={slotState(day[dose])}>
            <p style={{ fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>
              {dose === 'morning' ? 'AM' : 'PM'}
            </p>
            <p style={{ fontSize: '0.7rem' }}>{fmt(day[dose])}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
