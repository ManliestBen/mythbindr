import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Proxy API + websocket traffic to the Express server during dev so the
// browser only ever talks to the Vite origin (keeps WebAuthn origins simple).
export default defineConfig({
  plugins: [react()],
  build: {
    // @mythbindr/shared is a symlinked workspace package compiled to CommonJS.
    // Rollup resolves the symlink to its real path (packages/shared/dist/...),
    // which falls outside the CommonJS plugin's default include of
    // [/node_modules/] — so named imports of runtime values from the shared
    // package fail static resolution ("X is not exported by ...dist/index.js").
    // Widen the include so the shared dist is converted like any other CJS dep.
    commonjsOptions: {
      include: [/node_modules/, /packages\/shared\/dist/],
    },
  },
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
