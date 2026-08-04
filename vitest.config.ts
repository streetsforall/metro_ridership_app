import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    // Playwright specs under e2e/ use the @playwright/test runner, not Vitest — exclude them
    // (Vitest's default glob otherwise picks up *.spec.ts).
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
