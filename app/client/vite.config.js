import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// La versione mostrata nel pannello info viene sempre dal package.json,
// cosi non c'e' un secondo numero di versione da tenere allineato a mano.
const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8')
)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
