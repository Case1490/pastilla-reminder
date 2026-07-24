// Helpers compartidos por los route handlers. La app entera hablaba con Supabase
// sin mirar nunca el campo `error`, que es por lo que un 400 en cada confirmación
// pasó desapercibido. Aquí los errores siempre se convierten en respuesta.

export function ok<T>(data: T) {
  return Response.json(data as object)
}

export function fail(message: string, status = 500, detail?: unknown) {
  if (detail) console.error(`[api] ${message}`, detail)
  return Response.json({ error: message }, { status })
}
