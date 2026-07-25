'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { TZ } from './lib/lima'

type Dose = 'morning' | 'evening'

interface State {
  today: string
  config: {
    morning_hour: number
    evening_hour: number
    pill_stock: number
    pill_stock_alert: number
    ntfy_topic: string | null
  }
  logs: Record<Dose, { taken_at: string | null } | null>
}

export default function Home() {
  const [state, setState] = useState<State | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<Dose | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/state', { cache: 'no-store' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'No se pudo cargar')
      setState(body)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar')
    }
  }, [])

  // La carga inicial y la recarga al volver a la pestaña son el mismo caso: si la
  // app se queda abierta toda la noche, al retomarla el "hoy" ya cambió y
  // confirmaría sobre el día anterior.
  useEffect(() => {
    const refresh = () => {
      void load()
    }
    refresh()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [load])

  const confirm = async (dose: Dose) => {
    setSaving(dose)
    setError(null)
    try {
      const res = await fetch('/api/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dose }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'No se pudo registrar la toma')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar la toma')
    } finally {
      setSaving(null)
    }
  }

  const dateLabel = new Date().toLocaleDateString('es-PE', {
    timeZone: TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  const stock = state?.config.pill_stock ?? 0
  const stockAlert = state?.config.pill_stock_alert ?? 0
  const stockEmpty = !!state && stock === 0
  const stockLow = !!state && stock > 0 && stock <= stockAlert

  return (
    <main className="screen screen--center">
      <div className="stack fade">
        <header style={{ textAlign: 'center' }}>
          <p className="eyebrow">Medicación diaria</p>
          <h1 className="title" style={{ margin: '0.35rem 0 0.2rem' }}>
            Irma
          </h1>
          <p className="hint" style={{ textTransform: 'capitalize' }}>
            {dateLabel}
          </p>
        </header>

        {error && (
          <div className="alert alert--danger" role="alert">
            {error}
          </div>
        )}

        {!state && !error && (
          <p className="hint" style={{ textAlign: 'center', padding: '2rem 0' }}>
            Cargando…
          </p>
        )}

        {state && !state.config.ntfy_topic && (
          <div className="alert alert--warning">
            No hay un canal de notificaciones configurado. Los recordatorios no se
            enviarán hasta que lo definas en Configuración.
          </div>
        )}

        {(stockEmpty || stockLow) && (
          <div className={`alert ${stockEmpty ? 'alert--danger' : 'alert--warning'}`}>
            <WarningIcon />
            <span>
              {stockEmpty
                ? 'Sin pastillas en stock — reponer urgente'
                : `Quedan ${stock} mitades (${Math.floor(stock / 2)} pastillas)`}
            </span>
          </div>
        )}

        {state && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <DoseCard
                dose="morning"
                label="Mañana"
                hour={state.config.morning_hour}
                takenAt={state.logs.morning?.taken_at ?? null}
                busy={saving === 'morning'}
                onConfirm={() => confirm('morning')}
              />
              <DoseCard
                dose="evening"
                label="Noche"
                hour={state.config.evening_hour}
                takenAt={state.logs.evening?.taken_at ?? null}
                busy={saving === 'evening'}
                onConfirm={() => confirm('evening')}
              />
            </div>

            <div
              className="card"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <div>
                <p className="eyebrow">Stock de pastillas</p>
                <p style={{ fontSize: '1.35rem', fontWeight: 300, marginTop: '0.25rem' }}>
                  {Math.floor(stock / 2)}
                  <span className="hint" style={{ marginLeft: '0.4rem' }}>
                    pastillas · {stock} mitades
                  </span>
                </p>
              </div>
              <Link href="/settings" className="btn btn--inline" style={{ textDecoration: 'none' }}>
                Editar
              </Link>
            </div>
          </>
        )}

        <nav style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center' }}>
          <Link href="/history" className="link">
            Historial
          </Link>
          <Link href="/settings" className="link">
            Configuración
          </Link>
        </nav>
      </div>
    </main>
  )
}

function DoseCard({
  dose,
  label,
  hour,
  takenAt,
  busy,
  onConfirm,
}: {
  dose: Dose
  label: string
  hour: number
  takenAt: string | null
  busy: boolean
  onConfirm: () => void
}) {
  const isMorning = dose === 'morning'
  const taken = !!takenAt
  const color = isMorning ? 'var(--morning)' : 'var(--evening)'

  const takenTime = takenAt
    ? new Date(takenAt).toLocaleTimeString('es-PE', {
        timeZone: TZ,
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  return (
    <section className="dose" data-taken={taken}>
      <div className="dose__glyph" aria-hidden="true">
        {isMorning ? <SunIcon /> : <MoonIcon />}
      </div>

      <p className="eyebrow">{label}</p>
      <p className="dose__time" style={{ color: taken ? 'var(--accent)' : color, margin: '0.3rem 0' }}>
        {String(hour).padStart(2, '0')}:00
      </p>
      <p className="hint" style={{ marginBottom: '1.15rem' }}>
        Media pastilla
      </p>

      {taken ? (
        <p className="dose__status">
          <CheckIcon />
          Tomada a las {takenTime}
        </p>
      ) : (
        <button className="btn btn--accent" onClick={onConfirm} disabled={busy}>
          {busy ? 'Guardando…' : 'Confirmar toma'}
        </button>
      )}
    </section>
  )
}

function WarningIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M8 2L14 13H2L8 2Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M8 7v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="8" cy="11.5" r="0.6" fill="currentColor" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <path d="M2 6.5l3 3 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="6" stroke="var(--morning)" strokeWidth="1.5" />
      <path
        d="M16 4v3M16 25v3M4 16h3M25 16h3M7.5 7.5l2.1 2.1M22.4 22.4l2.1 2.1M7.5 24.5l2.1-2.1M22.4 9.6l2.1-2.1"
        stroke="var(--morning)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
      <path
        d="M20 6C13.4 6 8 11.4 8 18s5.4 12 12 12c3.2 0 6.1-1.2 8.3-3.2C26.8 28 24.5 28 22 28c-6.6 0-12-5.4-12-12 0-4.8 2.8-8.9 6.9-10.8C16.6 5.1 18.3 5 20 6z"
        stroke="var(--evening)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
