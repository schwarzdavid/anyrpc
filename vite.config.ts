/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import dts from 'vite-plugin-dts'
import { playwright } from '@vitest/browser-playwright'

export default defineConfig({
    plugins: [dts({ tsconfigPath: './tsconfig.lib.json', include: ['src'] })],
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
        },
    },
    build: {
        lib: {
            entry: {
                index: resolve(__dirname, 'src/index.ts'),
                iframe: resolve(__dirname, 'src/lib/adapter/iframe/index.ts'),
            },
            formats: ['es', 'cjs'],
        },
        rollupOptions: {
            output: {
                chunkFileNames: 'chunks/[name]-[hash].js',
            },
        },
    },
    test: {
        typecheck: {
            tsconfig: './tsconfig.vitest.json',
        },
        projects: [
            {
                extends: true,
                test: {
                    include: ['test/unit/**/*.test.ts', 'test/unit/**/*.test-d.ts'],
                    name: 'unit',
                    environment: 'jsdom',
                },
            },
            {
                extends: true,
                test: {
                    include: ['test/browser/**/*.test.ts'],
                    name: 'browser',
                    browser: {
                        provider: playwright(),
                        enabled: true,
                        headless: true,
                        instances: [{ browser: 'chromium' }, { browser: 'firefox' }, { browser: 'webkit' }],
                    },
                },
            },
        ],
    },
})
