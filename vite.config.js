import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // The an-array-of-english-words dictionary (~3.3MB of JSON, ~275k
    // words) is already lazy-loaded via dynamic import (see
    // lib/dictionary.js) — it's its own chunk and never part of the
    // initial page load, only fetched once a game actually needs word
    // validation. There's no further code-splitting that shrinks it
    // (it's data, not code), so this just raises the warning threshold
    // past its real size instead of nagging about an already-solved
    // problem on every build.
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
          output:{
              manualChunks(id) {
                  if (id.includes('node_modules')) {
                      return id.toString().split('node_modules/')[1].split('/')[0].toString();
                  }
              }
          }
      }
  }
})
