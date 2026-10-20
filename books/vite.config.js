import { defineConfig } from 'vite';

export default defineConfig({
  // Keep every font file on our own origin, including tiny language subsets.
  build: { assetsInlineLimit: 0 },
});
