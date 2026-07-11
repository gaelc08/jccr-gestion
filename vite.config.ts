import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // Racine de l'app (index.html dans public/)
  root: 'public',

  // Chemin de base — l'app est servie sous /gestion/ en prod
  base: '/gestion/',

  // Assets statiques (CSS, images, manifest)
  publicDir: '../public',

  resolve: {
    alias: {
      '@types': resolve(__dirname, 'src/types'),
      '@modules': resolve(__dirname, 'public/modules'),
    },
  },

  build: {
    // Dossier de sortie à la racine du projet
    outDir: '../dist',
    emptyOutDir: true,
    // Pas de hash sur les noms de fichiers (déploiement simple)
    rollupOptions: {
      input: resolve(__dirname, 'public/index.html'),
    },
  },

  server: {
    port: 3000,
    open: true,
    // Proxy API vers Supabase local si besoin
    proxy: {},
  },
});
