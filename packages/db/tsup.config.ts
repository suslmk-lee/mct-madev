import { defineConfig } from 'tsup';
import { cpSync } from 'node:fs';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ['sql.js'],
  onSuccess: async () => {
    cpSync('src/migrations', 'dist/migrations', { recursive: true });
  },
});
