import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: {
    port: 5179,
    strictPort: true,
    // `wrangler dev` sirve el Worker (/api/*) en el 8787.
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'favicon-*.png', 'apple-touch-icon.png', 'fonts/*.ttf'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,ttf}'],
        // Las sesiones las emite el Worker: nunca desde la caché.
        navigateFallbackDenylist: [/^\/api\//],
      },
      manifest: {
        name: 'Kovalt Roller',
        short_name: 'Roller',
        description: 'Mesa virtual para jugar Roll For Shoes con tus amigos.',
        lang: 'es',
        // theme: el bg de Pergamino oscuro (tema por defecto); fondo #0C1628, el de los íconos
        // (brand-and-iconography.md § App icons).
        theme_color: '#1e1711',
        background_color: '#0C1628',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
