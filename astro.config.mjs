import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  publicDir: 'public',
  vite: {
    plugins: [tailwindcss()],
    server: {
      watch: {
        // Redémarre le serveur dev quand du contenu est ajouté/supprimé
        paths: ['src/content'],
      },
    },
  },
});