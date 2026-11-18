import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: { include: ['src/**/*.test.ts'] },
  base: process.env.GITHUB_PAGES === 'true' ? '/web-cad/' : '/',
})
