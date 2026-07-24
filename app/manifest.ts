import type { MetadataRoute } from 'next'

// Para que Irma pueda instalarla desde el navegador y abrirla como una app,
// sin barra de direcciones, desde el escritorio del celular.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Recordatorio de Pastillas',
    short_name: 'Pastillas',
    description: 'Recordatorio de medicación diaria con registro de tomas y stock',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    lang: 'es-PE',
    categories: ['health', 'medical', 'lifestyle'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
