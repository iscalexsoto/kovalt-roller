import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Los emuladores son compartidos: nada de paralelismo entre archivos.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
