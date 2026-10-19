/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import dts from 'vite-plugin-dts'
import { playwright } from '@vitest/browser-playwright'

const WORKER_SCOPE_TESTS = 'test/unit/**/*.worker.test.ts'
const WORKER_SCOPE_TYPE_TESTS = 'test/unit/**/*.worker.test-d.ts'

export default defineConfig({
    plugins: [dts({ tsconfigPath: './tsconfig.lib.json', include: ['src'], exclude: ['node_modules/**'] })],
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
                'message-port': resolve(__dirname, 'src/lib/adapter/message-port/index.ts'),
                'web-worker': resolve(__dirname, 'src/lib/adapter/web-worker/index.ts'),
            },
        },
        rollupOptions: {
            output: [
                { format: 'es', chunkFileNames: 'chunks/[name]-[hash].js' },
                { format: 'cjs', chunkFileNames: 'chunks/[name]-[hash].cjs' },
            ],
        },
    },
    test: {
        silent: 'passed-only',
        coverage: {
            include: ['src/**'],
            thresholds: { 100: true },
        },
        projects: [
            {
                extends: true,
                test: {
                    name: 'unit',
                    environment: 'jsdom',
                    include: ['test/unit/**/*.test.ts'],
                    exclude: [WORKER_SCOPE_TESTS],
                    typecheck: {
                        enabled: true,
                        tsconfig: './tsconfig.vitest.json',
                        include: ['test/unit/**/*.test-d.ts'],
                        exclude: [WORKER_SCOPE_TYPE_TESTS],
                    },
                },
            },
            {
                extends: true,
                test: {
                    name: 'unit-webworker',
                    environment: 'jsdom',
                    include: [WORKER_SCOPE_TESTS],
                    typecheck: {
                        enabled: true,
                        tsconfig: './tsconfig.vitest.webworker.json',
                        include: [WORKER_SCOPE_TYPE_TESTS],
                    },
                },
            },
            {
                extends: true,
                test: {
                    name: 'build',
                    environment: 'node',
                    include: ['test/build/**/*.test.ts'],
                },
            },
            {
                extends: true,
                test: {
                    name: 'browser',
                    include: ['test/browser/**/*.test.ts'],
                    browser: {
                        enabled: true,
                        headless: true,
                        provider: playwright(),
                        instances: [{ browser: 'chromium' }],
                    },
                },
            },
        ],
    },
})
