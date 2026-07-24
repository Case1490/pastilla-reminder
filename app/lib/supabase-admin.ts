import 'server-only'

import { createClient } from '@supabase/supabase-js'

// Cliente con service role: hace bypass de RLS y NUNCA debe llegar al navegador.
// El import de 'server-only' hace que el build falle si alguna vez se importa
// desde un componente cliente, en lugar de filtrar la llave en silencio.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceRoleKey) {
  throw new Error(
    'Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY. Revisa .env.local'
  )
}

export const supabaseAdmin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

export interface ReminderConfig {
  ntfy_topic: string | null
  morning_hour: number
  evening_hour: number
  followup_minutes: number
  pill_stock: number
  pill_stock_alert: number
}

export interface PillLog {
  dose: 'morning' | 'evening'
  log_date: string
  taken_at: string | null
}

export const CONFIG_COLUMNS =
  'ntfy_topic, morning_hour, evening_hour, followup_minutes, pill_stock, pill_stock_alert'
