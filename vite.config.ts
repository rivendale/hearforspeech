import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/', 
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons.svg'],
      manifest: {
        name: 'Hear for Speech - Local clinical biofeedback',
        short_name: 'Hear4Speech',
        description: 'Local-first clinical acoustic biofeedback and session tracking for speech therapy',
        theme_color: '#4F46E5',
        background_color: '#0F172A',
        display: 'standalone',
        orientation: 'portrait-primary',
        categories: ['medical', 'education', 'utilities'],
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any'
          },
          {
            src: 'icons.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,json}'],
        navigateFallback: '/index.html'
      }
    })
  ]
});
