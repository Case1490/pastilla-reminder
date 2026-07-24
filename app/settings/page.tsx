'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Config {
  ntfy_topic: string
  morning_hour: string
  evening_hour: string
  followup_minutes: string
  pill_stock: string
  pill_stock_alert: string
}

const EMPTY: Config = {
  ntfy_topic: '',
  morning_hour: '8',
  evening_hour: '20',
  followup_minutes: '30',
  pill_stock: '0',
  pill_stock_alert: '14',
}

export default function Settings() {
  const [form, setForm] = useState<Config>(EMPTY)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/config', { cache: 'no-store' })
        const body = await res.json()
        if (!res.ok) throw new Error(body.error ?? 'No se pudo cargar la configuración')
        setForm({
          ntfy_topic: body.ntfy_topic ?? '',
          morning_hour: String(body.morning_hour ?? 8),
          evening_hour: String(body.evening_hour ?? 20),
          followup_minutes: String(body.followup_minutes ?? 30),
          pill_stock: String(body.pill_stock ?? 0),
          pill_stock_alert: String(body.pill_stock_alert ?? 14),
        })
      } catch (e) {
        setNotice({
          kind: 'error',
          text: e instanceof Error ? e.message : 'No se pudo cargar la configuración',
        })
      } finally {
        setLoaded(true)
      }
    })()
  }, [])

  const set = (key: keyof Config) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }))

  const save = async () => {
    setSaving(true)
    setNotice(null)
    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ntfy_topic: form.ntfy_topic.trim(),
          morning_hour: Number(form.morning_hour),
          evening_hour: Number(form.evening_hour),
          followup_minutes: Number(form.followup_minutes),
          pill_stock: Number(form.pill_stock),
          pill_stock_alert: Number(form.pill_stock_alert),
        }),
      })
      const body = await res.json()
      // El servidor valida y devuelve el motivo exacto; mostrarlo en vez de un
      // "Error" genérico es la diferencia entre poder arreglarlo y no saber qué pasó.
      if (!res.ok) throw new Error(body.error ?? 'No se pudo guardar')
      setNotice({ kind: 'ok', text: 'Configuración guardada' })
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'No se pudo guardar' })
    } finally {
      setSaving(false)
    }
  }

  const sendTest = async () => {
    setTesting(true)
    setNotice(null)
    try {
      const res = await fetch('/api/send-reminder', { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'No se pudo enviar')
      setNotice({ kind: 'ok', text: `Notificación enviada a "${body.topic}"` })
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'No se pudo enviar' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <main className="screen">
      <div className="stack fade">
        <header>
          <p className="eyebrow">Configuración</p>
          <h1 className="title" style={{ marginTop: '0.35rem' }}>
            Recordatorios
          </h1>
        </header>

        {notice && (
          <div
            className={`alert ${notice.kind === 'ok' ? 'alert--ok' : 'alert--danger'}`}
            role="status"
          >
            {notice.text}
          </div>
        )}

        <Field
          id="topic"
          label="Canal ntfy"
          hint="El nombre del topic suscrito en la app ntfy del celular."
          value={form.ntfy_topic}
          onChange={set('ntfy_topic')}
          placeholder="pastilla-irma-20"
        />

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Field
            id="morning"
            label="Hora mañana"
            type="number"
            min={0}
            max={23}
            value={form.morning_hour}
            onChange={set('morning_hour')}
          />
          <Field
            id="evening"
            label="Hora noche"
            type="number"
            min={0}
            max={23}
            value={form.evening_hour}
            onChange={set('evening_hour')}
          />
        </div>

        <Field
          id="followup"
          label="Reintento (minutos)"
          hint="Si no confirma, se vuelve a avisar cada tantos minutos, hasta 4 veces."
          type="number"
          min={5}
          max={240}
          value={form.followup_minutes}
          onChange={set('followup_minutes')}
        />

        <Field
          id="stock"
          label="Stock actual (mitades)"
          hint="Cada pastilla son 2 mitades. Si tienes 10 pastillas, escribe 20."
          type="number"
          min={0}
          value={form.pill_stock}
          onChange={set('pill_stock')}
        />

        <Field
          id="alert"
          label="Avisar cuando queden (mitades)"
          hint="Llega una notificación al día mientras el stock esté por debajo."
          type="number"
          min={0}
          value={form.pill_stock_alert}
          onChange={set('pill_stock_alert')}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          <button className="btn btn--accent" onClick={save} disabled={saving || !loaded}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
          <button
            className="btn btn--ghost"
            onClick={sendTest}
            disabled={testing || !loaded || !form.ntfy_topic}
          >
            {testing ? 'Enviando…' : 'Enviar notificación de prueba'}
          </button>
        </div>

        <Link href="/" className="link" style={{ textAlign: 'center' }}>
          ← Volver
        </Link>
      </div>
    </main>
  )
}

function Field({
  id,
  label,
  hint,
  ...input
}: {
  id: string
  label: string
  hint?: string
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1 }}>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {hint && <p className="hint">{hint}</p>}
      <input id={id} className="input" {...input} />
    </div>
  )
}
