// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ⚠️ Remplace '/ham-learn/' par le NOM EXACT de ton dépôt GitHub Pages.
// Si ton site est à la racine (user.github.io), mets base: '/'.
export default defineConfig({
  base: '/ham-learn/',
  plugins: [react()],
})