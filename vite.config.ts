import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // Accommodate inlined OpenCV.js WASM bundle (~16.6 MB)
        maximumFileSizeToCacheInBytes: 25 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm}'],
      },
      manifest: {
        name: '50m Pool Digital Twin & Race Calibrator',
        short_name: 'PoolTwin',
        theme_color: '#0b1120',
        background_color: '#0b1120',
        display: 'standalone',
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          opencv: ['@techstark/opencv-js'],
          three: ['three', '@react-three/fiber', '@react-three/drei'],
        },
      },
    },
  },
});