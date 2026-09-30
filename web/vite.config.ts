import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Override with SYNCVERSE_SERVER=http://localhost:4300 if port 4000 is taken (the reconnect test does this).
const SERVER = process.env.SYNCVERSE_SERVER ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // y-monaco imports the whole 'monaco-editor' bundle (every language). Point it at the lean core API instead.
    alias: [{ find: /^monaco-editor$/, replacement: 'monaco-editor/esm/vs/editor/editor.api' }],
  },
  server: {
    host: true, // reachable from other devices on the same network / phone hotspot
    port: 5173,
    proxy: {
      '/api': { target: SERVER, changeOrigin: true },
      '/collab': { target: SERVER, ws: true, changeOrigin: true },
    },
  },
});
