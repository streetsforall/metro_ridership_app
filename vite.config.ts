import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { visualizer } from 'rollup-plugin-visualizer';
import { ridershipDataPlugin } from './vite/ridership-data-plugin';
import { stopRidershipPlugin } from './vite/stop-ridership-plugin';

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    // Ships the ridership dataset as a fetched columnar asset instead of inlining
    // it into the JS bundle; also provides the `virtual:ridership-bounds` module.
    ridershipDataPlugin(),
    // Serves the pre-encoded stop payloads as fetched assets and provides
    // `virtual:stop-ridership-manifest`. Tolerates the data files being absent — see
    // the plugin's header.
    stopRidershipPlugin(),
    // basicSsl only runs in dev (vite serve); excluded from production builds
    ...(command === 'serve' ? [basicSsl()] : []),
    // Bundle treemap, opt-in via `ANALYZE=1 npm run build` → dist/stats.html
    ...(process.env.ANALYZE
      ? [
          visualizer({
            filename: 'dist/stats.html',
            gzipSize: true,
            brotliSize: true,
            template: 'treemap',
          }),
        ]
      : []),
  ],
}));
