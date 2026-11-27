import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node20',
  outDir: 'dist',
  splitting: false,
  minify: false,
  treeshake: true,
  platform: 'node',
  define: {
    __PACKAGE_VERSION__: JSON.stringify(pkg.version),
  },
  banner: {
    js: '#!/usr/bin/env node',
  },
  external: [/^@modelcontextprotocol\//, 'yanki-connect', 'zod', 'express'],
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
