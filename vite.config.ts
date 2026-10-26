/// <reference types="vitest/config" />
import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { createAnalysisMiddleware } from './src/server/api'

/**
 * Serves /api/analysis from the dev and preview servers. Runs in Node only: OPENROUTER_* variables are read
 * here (from .env.local or the environment) and never reach the browser bundle, which only sees VITE_* vars.
 */
function analysisApi(env: Record<string, string>): Plugin {
  let middleware: ReturnType<typeof createAnalysisMiddleware> | undefined
  const get = (root: string) => (middleware ??= createAnalysisMiddleware({ env, root }))
  return {
    name: 'creative-analysis-api',
    configureServer(server) {
      server.middlewares.use(get(server.config.root))
    },
    configurePreviewServer(server) {
      server.middlewares.use(get(server.config.root))
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'OPENROUTER_')
  return {
    plugins: [react(), tailwindcss(), analysisApi(env)],
    resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
    test: {
      include: ['src/**/*.test.ts'],
    },
  }
})
