import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import { ridershipDataPlugin } from './vite/ridership-data-plugin';

export default defineConfig({
  // ridershipDataPlugin resolves `virtual:ridership-bounds` (imported by
  // src/utils/dataDateRange.ts) so the module tree loads under the test runner.
  plugins: [react(), ridershipDataPlugin()],
  test: {
    environment: 'jsdom',
    globals: true,
    // Polyfills `window.matchMedia`, which jsdom does not implement — see src/test-setup.ts.
    setupFiles: ['./src/test-setup.ts'],
    // Playwright specs under e2e/ use the @playwright/test runner, not Vitest — exclude them
    // (Vitest's default glob otherwise picks up *.spec.ts).
    // `.claude/worktrees` holds throwaway git worktrees created by Claude Code, each a full copy
    // of the source; without this the whole suite is collected once per worktree.
    exclude: [...configDefaults.exclude, 'e2e/**', '.claude/**'],
  },
});
