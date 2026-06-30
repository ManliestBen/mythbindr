import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Proxy API + websocket traffic to the Express server during dev so the
// browser only ever talks to the Vite origin (keeps WebAuthn origins simple).
export default defineConfig({
  plugins: [react()],
  server: {
    // Bind all interfaces (0.0.0.0) so WSL2 forwards localhost:5173 from the
    // Windows browser. Loopback-only (the Vite default) isn't reliably forwarded.
    host: true,
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/socket.io': { target: 'http://localhost:4000', ws: true },
    },
  },
});
