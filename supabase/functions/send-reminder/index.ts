import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Invocada por pg_cron cada 15 minutos. En cada corrida decide, para cada dosis
// del día, si toca avisar; y avisa una vez al día si el stock está bajo.
// Es idempotente: correrla de más no manda notificaciones de más.

const TZ = 'America/Lima'
const TZ_OFFSET = '-05:00' // Perú no tiene horario de verano
const WINDOW_MINUTES = 4 * 60 // tras 4h sin confirmar, se deja de insistir
const MAX_NOTIFICATIONS = 4 // aviso inicial + 3 reintentos

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

interface PillLogRow {
  dose: 'morning' | 'evening'
  log_date: string
  taken_at: string | null
  last_notified_at: string | null
  notify_count: number
}

/**
 * La versión anterior hacía `new Date(d.toLocaleString('en-US', {timeZone}))` y
 * luego `.toISOString()`, que aplica el desfase dos veces: el runtime corre en
 * UTC, así que entre las 19:00 y la medianoche de Lima calculaba el día
 * siguiente y buscaba el log equivocado.
 */
function limaParts(d: Date) {
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
  // "hoy" ya es otro día. Se evalúa también ayer para no perder esa cola.
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

  const doses = [
    { dose: 'morning' as const, hour: config.morning_hour, label: 'mañana', emoji: '🌅' },
    { dose: 'evening' as const, hour: config.evening_hour, label: 'noche', emoji: '🌙' },
  ]

  // Cada dosis se evalúa en su ocurrencia de ayer y la de hoy. El instante
  // programado es absoluto, así que la ventana se mide en tiempo real y cruzar la
  // medianoche deja de importar: antes, tras las 00:00, la cola de la toma
  // nocturna caía como `elapsed` negativo y se dejaba de insistir. La
  // comprobación de ventana descarta sola las ocurrencias fuera de rango.
  const occurrences = doses.flatMap(d =>
    [yesterday, today].map(date => {
      const scheduledTime = `${date}T${String(d.hour).padStart(2, '0')}:00:00${TZ_OFFSET}`
      return { ...d, logDate: date, scheduledTime, scheduled: new Date(scheduledTime) }
    })
  )

  for (const occ of occurrences) {
    const elapsed = (now.getTime() - occ.scheduled.getTime()) / 60000
    if (elapsed < 0) continue // todavía no es la hora
    if (elapsed > WINDOW_MINUTES) continue // la ventana ya cerró

    const log = (logs as PillLogRow[]).find(
      l => l.dose === occ.dose && l.log_date === occ.logDate
    )
    if (log?.taken_at) continue
    if ((log?.notify_count ?? 0) >= MAX_NOTIFICATIONS) continue

    // El reintento se mide contra el último aviso real, no contra la grilla del
    // cron, así que no depende de que las corridas caigan exactas.
    if (log?.last_notified_at) {
      const sinceLast = (now.getTime() - new Date(log.last_notified_at).getTime()) / 60000
      if (sinceLast < config.followup_minutes) continue
    }

    const attempt = (log?.notify_count ?? 0) + 1
    try {
      await notify(
        config.ntfy_topic,
        `Pastilla de la ${occ.label}`,
        attempt === 1
          ? `${occ.emoji} Es hora de tomar tu media pastilla de la ${occ.label}. Confírmalo en la app.`
          : `${occ.emoji} Recordatorio ${attempt}: aún no confirmas la media pastilla de la ${occ.label}.`
      )
    } catch (e) {
      console.error('ntfy', e)
      continue
    }

    const { error } = await supabase.from('pill_logs').upsert(
      {
        dose: occ.dose,
        log_date: occ.logDate,
        scheduled_time: occ.scheduledTime,
        last_notified_at: now.toISOString(),
        notify_count: attempt,
      },
      { onConflict: 'dose,log_date' }
    )
    if (error) console.error('upsert log', error)

    actions.push(`${occ.dose}@${occ.logDate}:aviso#${attempt}`)
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
