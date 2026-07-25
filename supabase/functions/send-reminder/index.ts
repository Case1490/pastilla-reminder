import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { limaParts, dueReminders, type PillLogRow } from './logic.ts'

// Invocada por pg_cron cada 15 minutos. En cada corrida decide, para cada dosis
// del día, si toca avisar; y avisa una vez al día si el stock está bajo.
// Es idempotente: correrla de más no manda notificaciones de más.
//
// La decisión de qué avisar vive en logic.ts (puro y testeado); aquí queda solo
// el I/O: leer config y logs, enviar por ntfy y registrar el aviso.

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

async function notify(topic: string, title: string, body: string, priority = 'high') {
  const res = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
    method: 'POST',
    headers: {
      Title: title,
      Priority: priority,
      Tags: 'pill',
      'Content-Type': 'text/plain; charset=utf-8',
    },
    body,
  })
  if (!res.ok) throw new Error(`ntfy respondió ${res.status}: ${await res.text()}`)
}

Deno.serve(async () => {
  const now = new Date()
  const { date: today, hour, minute } = limaParts(now)
  // La ventana de 4h de una dosis puede cruzar la medianoche, y tras las 00:00
  // "hoy" ya es otro día. Se consulta también ayer para no perder esa cola.
  const yesterday = limaParts(new Date(now.getTime() - 86_400_000)).date
  const actions: string[] = []

  const { data: config, error: configError } = await supabase
    .from('reminder_config')
    .select(
      'ntfy_topic, morning_hour, evening_hour, followup_minutes, pill_stock, pill_stock_alert, last_stock_alert_on'
    )
    .eq('id', 1)
    .single()

  if (configError) {
    console.error('config', configError)
    return Response.json({ error: 'No se pudo leer la configuración' }, { status: 500 })
  }
  if (!config.ntfy_topic) {
    return Response.json({ skipped: 'sin topic configurado' })
  }

  const { data: logs, error: logsError } = await supabase
    .from('pill_logs')
    .select('dose, log_date, taken_at, last_notified_at, notify_count')
    .in('log_date', [yesterday, today])

  if (logsError) {
    console.error('logs', logsError)
    return Response.json({ error: 'No se pudo leer el registro del día' }, { status: 500 })
  }

  const reminders = dueReminders(
    now,
    {
      morning_hour: config.morning_hour,
      evening_hour: config.evening_hour,
      followup_minutes: config.followup_minutes,
    },
    logs as PillLogRow[]
  )

  for (const r of reminders) {
    try {
      await notify(
        config.ntfy_topic,
        `Pastilla de la ${r.label}`,
        r.attempt === 1
          ? `${r.emoji} Es hora de tomar tu media pastilla de la ${r.label}. Confírmalo en la app.`
          : `${r.emoji} Recordatorio ${r.attempt}: aún no confirmas la media pastilla de la ${r.label}.`
      )
    } catch (e) {
      console.error('ntfy', e)
      continue
    }

    const { error } = await supabase.from('pill_logs').upsert(
      {
        dose: r.dose,
        log_date: r.logDate,
        scheduled_time: r.scheduledTime,
        last_notified_at: now.toISOString(),
        notify_count: r.attempt,
      },
      { onConflict: 'dose,log_date' }
    )
    if (error) console.error('upsert log', error)

    actions.push(`${r.dose}@${r.logDate}:aviso#${r.attempt}`)
  }

  // Alerta de stock: la pantalla de configuración la prometía pero no existía en
  // ningún lado. Una vez al día como máximo, para no repetirla en cada corrida.
  if (
    config.pill_stock <= config.pill_stock_alert &&
    config.last_stock_alert_on !== today
  ) {
    const pills = Math.floor(config.pill_stock / 2)
    try {
      await notify(
        config.ntfy_topic,
        'Stock de pastillas bajo',
        config.pill_stock === 0
          ? '⚠️ No quedan pastillas. Hay que reponer hoy.'
          : `⚠️ Quedan ${config.pill_stock} mitades (${pills} pastillas). Conviene reponer.`,
        'default'
      )
      await supabase
        .from('reminder_config')
        .update({ last_stock_alert_on: today })
        .eq('id', 1)
      actions.push('stock:aviso')
    } catch (e) {
      console.error('ntfy stock', e)
    }
  }

  return Response.json({ today, hour, minute, actions })
})
