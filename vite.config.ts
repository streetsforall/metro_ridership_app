import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import basicSsl from '@vitejs/plugin-basic-ssl';

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // basicSsl only runs in dev (vite serve); excluded from production builds
  plugins: [react(), ...(command === 'serve' ? [basicSsl()] : [])],
}));
