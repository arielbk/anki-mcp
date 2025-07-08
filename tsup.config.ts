import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node18',
  outDir: 'dist',
  splitting: false,
  minify: false,
  treeshake: true,
  platform: 'node',
  banner: {
    js: '#!/usr/bin/env node',
  },
  external: ['@modelcontextprotocol/sdk', 'yanki-connect', 'zod'],
  noExternal: [],
  esbuildOptions: (options) => {
    options.banner = {
      js: '#!/usr/bin/env node',
    };
    options.platform = 'node';
    options.format = 'esm';
    options.packages = 'external';
  },
});
