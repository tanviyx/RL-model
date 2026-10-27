import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'

// The dev server uses HTTPS certificates when they exist (inside the Docker image).
// `vite build` (used by CI) must work without them.
const keyPath = '/app/certs/localhost-key.pem'
const certPath = '/app/certs/localhost.pem'
const https =
  fs.existsSync(keyPath) && fs.existsSync(certPath)
    ? { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }
    : undefined

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",   // needed inside Docker
    port: 5173,
    https,
  },
})

