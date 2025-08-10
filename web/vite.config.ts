import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@services': path.resolve(__dirname, './src/services'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@types': path.resolve(__dirname, './src/types'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@assets': path.resolve(__dirname, './src/assets'),
      '@generated': path.resolve(__dirname, './src/generated'),
      '@config': path.resolve(__dirname, './src/config'),
      '@routes': path.resolve(__dirname, './src/routes')
    }
  },
  optimizeDeps: {
    exclude: ['playwright', '@playwright/test', 'playwright-core']
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': {
        // Use internal Docker URL when provided; otherwise default to host API
        target: process.env.API_INTERNAL_URL || 'http://localhost:8000',
        changeOrigin: true,
        // Keep the '/api' prefix when proxying so backend aliases like
        // '/api/...'(and '/api/v1/...') resolve correctly.
        // IMPORTANT: Do not rewrite the path here.
        rewrite: (p) => p
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'fluent-vendor': ['@fluentui/react-components'],
          'msal-vendor': ['@azure/msal-browser', '@azure/msal-react']
        }
      }
    }
  }
});