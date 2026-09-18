import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const API_TARGET = process.env.VITE_API_PROXY ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    // `npm run dev:host` binds every interface so a phone or second machine on the same
    // network can open the site by this host's LAN IP. Vite blocks unknown Host headers
    // by default; bare IP addresses are what we actually serve on, so allow those.
    allowedHosts: true,
    // The SPA talks to a same-origin /api in development; Vite proxies it to Express,
    // which keeps the production and development API base URLs identical.
    proxy: { '/api': { target: API_TARGET, changeOrigin: true } },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        /**
         * Split vendors by package path rather than by entry name, so deep imports
         * (react-dom/client, react-router internals) land in the right chunk instead of
         * being pulled into the app bundle. `charts` is only reached from lazily loaded
         * admin pages, so a shopper never downloads it.
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/.test(id)) {
            return 'react';
          }
          if (id.includes('@tanstack')) return 'query';
          if (/[\\/]node_modules[\\/](recharts|d3-|victory|decimal\.js-light|internmap|fast-equals|eventemitter3)/.test(id)) {
            return 'charts';
          }
          return 'vendor';
        },
      },
    },
  },
});
