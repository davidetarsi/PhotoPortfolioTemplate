import { resolve } from 'path'
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import { readFileSync, existsSync } from 'fs'
import { siteConfig } from './config/site.config.js'
import { injectSiteMeta } from './src/utils/injectSiteMeta.js'
import { buildHeaders } from './src/utils/buildHeaders.js'
import { devRouteFallback } from './src/utils/devRouteFallback.js'
import { createCustomThemePlugins, customThemeRollupInput } from './src/utils/customTheme.js'

// Letto una volta: serve sia al meta og:image sia alla CSP, e leggerlo due
// volte aprirebbe la porta a due valori diversi nello stesso build.
const wranglerConfig = existsSync('wrangler.json')
  ? JSON.parse(readFileSync('wrangler.json', 'utf8'))
  : null
const r2PublicUrl = wranglerConfig?.vars?.R2_PUBLIC_URL ?? ''

const devRouteFallbackPlugin = () => ({
  name: 'dev-route-fallback',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use(devRouteFallback)
  },
})

// Sostituisce i placeholder {{SITE_*}} negli HTML a build time (e in dev),
// così titolo e Open Graph sono nell'HTML statico visibile ai crawler social.
const siteMetaPlugin = () => ({
  name: 'site-meta',
  transformIndexHtml: {
    order: 'pre',
    handler: html => injectSiteMeta(html, siteConfig, r2PublicUrl),
  },
})

// Genera dist/_headers dalle origini R2 di wrangler.json, invece di tenere
// il file statico allineato a mano (audit di luglio, punto 2).
const headersPlugin = () => ({
  name: 'generate-headers',
  apply: 'build',
  generateBundle() {
    if (!existsSync('wrangler.json')) {
      this.error('wrangler.json non trovato. Crealo con `cp wrangler.example.json wrangler.json` e compilalo, oppure genera tutto con `npm run infra:sync`.')
    }
    // ALLOW_PLACEHOLDER_CSP=1 serve solo a verificare che il template
    // compili prima che qualcuno ci metta i propri valori. Mai in un deploy.
    this.emitFile({
      type: 'asset',
      fileName: '_headers',
      source: buildHeaders(JSON.parse(readFileSync('wrangler.json', 'utf8')), {
        allowPlaceholders: process.env.ALLOW_PLACEHOLDER_CSP === '1',
      }),
    })
  },
})

export default defineConfig({
  plugins: [devRouteFallbackPlugin(), siteMetaPlugin(), ...createCustomThemePlugins({ root: __dirname }), headersPlugin()],
  test: {
    environment: 'jsdom',
    exclude: [...configDefaults.exclude, '**/.worktrees/**'],
  },
  build: {
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        album: resolve(__dirname, 'album.html'),
        about: resolve(__dirname, 'about.html'),
        admin: resolve(__dirname, 'admin.html'),
        ...customThemeRollupInput(resolve(__dirname, 'custom/theme.css')),
      },
    },
  },
})
