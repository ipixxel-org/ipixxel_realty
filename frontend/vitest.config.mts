import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // Full-page UI flows (wizards, walkthroughs) regularly need more than the
    // 5s default on CI-class machines.
    testTimeout: 15000,
  },
})