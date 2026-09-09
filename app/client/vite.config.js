import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// La versione mostrata nel pannello info viene sempre dal package.json,
// cosi non c'e' un secondo numero di versione da tenere allineato a mano.
const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8')
)

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['spg.svg', 'spg_full.svg', 'spg_mobile.svg'],
      manifest: {
        name: 'Party Song Guess',
        short_name: 'Party Song Guess',
        description: 'Multiplayer music guessing game',
        start_url: '/',
        display: 'standalone',
        background_color: '#070812',
        theme_color: '#070812',
        icons: [
          {
            src: '/spg.svg',
            sizes: '320x320',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
  },
  server: {
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      'party-song-guess.onrender.com',
    ],
  },
})
