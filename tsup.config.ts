import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  tsconfig: './tsconfig.build.json', // Use build-specific tsconfig
  sourcemap: true,
  clean: false,
  format: ['esm'], // Build as ESM for ElizaOS compatibility
  dts: true,
  outExtension({ format }) {
    return {
      js: '.js', // Always use .js extension
      dts: '.d.ts'
    }
  },
  external: [
    'dotenv', // Externalize dotenv to prevent bundling
    'fs', // Externalize fs to use Node.js built-in module
    'path', // Externalize other built-ins if necessary
    'https',
    'http',
    '@elizaos/core',
    'zod',
  ],
});
