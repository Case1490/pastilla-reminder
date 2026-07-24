import { supabaseAdmin } from '../../lib/supabase-admin'
import { ok, fail } from '../../lib/api'

export const dynamic = 'force-dynamic'

/**
 * Notificación de prueba al canal configurado.
 *
 * El topic sale de la base, no del cuerpo de la petición. Antes se reenviaba a
 * `https://ntfy.sh/${topic}` con lo que mandara el cliente, así que la ruta era
 * un relay abierto: cualquiera podía usar este servidor para publicar en
 * cualquier canal de ntfy.
 */
export async function POST() {
  const { data, error } = await supabaseAdmin
    .from('reminder_config')
    .select('ntfy_topic')
    .eq('id', 1)
    .single()

  if (error) return fail('No se pudo leer la configuración', 500, error)
  if (!data.ntfy_topic) return fail('No hay un canal ntfy configurado', 400)

  let res: Response
  try {
    res = await fetch(`https://ntfy.sh/${encodeURIComponent(data.ntfy_topic)}`, {
      method: 'POST',
      headers: {
        Title: 'Prueba de notificacion',
        Priority: 'default',
        Tags: 'pill',
        'Content-Type': 'text/plain; charset=utf-8',
      },
      body: 'Los recordatorios estan funcionando correctamente.',
    })
  } catch (e) {
    return fail('No se pudo contactar con ntfy.sh', 502, e)
  }

  if (!res.ok) {
    return fail(`ntfy.sh respondió ${res.status}`, 502, await res.text().catch(() => ''))
  }

  return ok({ sent: true, topic: data.ntfy_topic })
}
