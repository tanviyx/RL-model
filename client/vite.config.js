import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",   // 👈 IMPORTANT for Docker
    port: 5173,
    https: {
      key: fs.readFileSync('/app/certs/localhost-key.pem'),   // ✅ FIXED
      cert: fs.readFileSync('/app/certs/localhost.pem'),      // ✅ FIXED
    }
  }
})


