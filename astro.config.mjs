import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  publicDir: 'public',
  vite: {
    plugins: [tailwindcss()],
  },
});