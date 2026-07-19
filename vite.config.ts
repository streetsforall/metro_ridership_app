import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import basicSsl from '@vitejs/plugin-basic-ssl';

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // basicSsl only runs in dev (vite serve); excluded from production builds
  plugins: [react(), ...(command === 'serve' ? [basicSsl()] : [])],
  server: {
    // With https enabled and no `proxy` set, Vite serves over http2
    // (`createSecureServer({ allowHTTP1: true })`). Node >=22.21 added an
    // internal `server.shouldUpgradeCallback(req)` call in the HTTP/1 parser
    // that http2 compat servers don't define, so every HTTP/1.1 request
    // crashes the dev server. Defining `proxy` routes Vite through
    // `node:https` instead, which has the callback.
    proxy: {},
  },
}));
