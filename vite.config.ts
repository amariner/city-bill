import { defineConfig } from 'vite';

export default defineConfig({
  // En desarrollo conserva rutas de raíz; GitHub Pages publica este repositorio
  // bajo /city-bill/, por eso el bundle de CI necesita prefijar sus assets.
  base: process.env.GITHUB_ACTIONS ? '/city-bill/' : '/',
  server: {
    port: 8888,
    strictPort: true,
  },
});
