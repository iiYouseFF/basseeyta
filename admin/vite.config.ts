import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/admin/',
  server: {
    proxy: {
      '/admin': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
      '/users': 'http://localhost:3000',
      '/technicians': 'http://localhost:3000',
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
  build: {
    outDir: '../public/admin',
    emptyOutDir: true,
  },
});
