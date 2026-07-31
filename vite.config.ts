import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base path is "/" for Cloudflare Pages / Vercel / local dev.
// GitHub Pages project sites need "/<repo-name>/" — the deploy workflow sets NEXUSQ_BASE.
export default defineConfig({
  base: process.env.NEXUSQ_BASE ?? '/',
  plugins: [react()],
})
