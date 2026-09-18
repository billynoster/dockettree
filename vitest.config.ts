import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/server/**/*.test.ts'],
    // The SQLite adapter is a single connection per test, so files run in isolation.
    fileParallelism: true,
    testTimeout: 20_000,
  },
})
