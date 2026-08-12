import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import pkg from './package.json'

export default defineConfig({
  plugins: [
    react(),
  ],
  define: {
    __APP_BUILD_ID__: JSON.stringify(pkg.version),
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@electron': path.resolve(__dirname, 'electron')
    }
  },
  server: {
    port: 5173,
    watch: {
      ignored: ['**/dist-electron/**', '**/release/**']
    }
  },
  cacheDir: 'C:/tmp/vite-cache',
  optimizeDeps: {
    entries: ['index.html'],
    esbuildOptions: {
      sourcemap: false
    }
  },
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: false,
    copyPublicDir: true,
    minify: false,
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          echarts: ['echarts', 'echarts-for-react'],
          vendor: ['react', 'react-dom', 'react-router-dom', 'framer-motion', 'zustand']
        }
      }
    }
  }
})
