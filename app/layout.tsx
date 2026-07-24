import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'

const geist = Geist({ subsets: ['latin'], display: 'swap' })

export const metadata: Metadata = {
  title: 'Recordatorio de Pastillas',
  description: 'Recordatorio de medicación diaria con registro de tomas y stock',
  applicationName: 'Pastillas',
  appleWebApp: {
    capable: true,
    title: 'Pastillas',
    statusBarStyle: 'black-translucent',
  },
  // Es una app privada de uso personal: no tiene nada que hacer en un buscador.
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  // viewportFit cover para que el fondo llegue bajo el notch en pantalla completa.
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={geist.className}>{children}</body>
    </html>
  )
}
