/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { dts } from 'rolldown-plugin-dts'
import { playwright } from '@vitest/browser-playwright'

const WORKER_SCOPE_TESTS = 'test/unit/**/*.worker.test.ts'
const WORKER_SCOPE_TYPE_TESTS = 'test/unit/**/*.worker.test-d.ts'
const NODE_SCOPE_TESTS = 'test/unit/**/*.node.test.ts'

export default defineConfig({
    oxc: {
        exclude: [/\.js$/, /\.d\.[cm]?ts$/],
    },
    resolve: {
        alias: {
            '@': resolve(import.meta.dirname, 'src'),
        },
    },
    build: {
        sourcemap: true,
        lib: {
            entry: {
                index: resolve(import.meta.dirname, 'src/index.ts'),
                iframe: resolve(import.meta.dirname, 'src/lib/adapter/iframe/index.ts'),
                'message-port': resolve(import.meta.dirname, 'src/lib/adapter/message-port/index.ts'),
                'web-worker': resolve(import.meta.dirname, 'src/lib/adapter/web-worker/index.ts'),
                'node-worker': resolve(import.meta.dirname, 'src/lib/adapter/node-worker/index.ts'),
                'child-process': resolve(import.meta.dirname, 'src/lib/adapter/child-process/index.ts'),
                socket: resolve(import.meta.dirname, 'src/lib/adapter/socket/index.ts'),
                websocket: resolve(import.meta.dirname, 'src/lib/adapter/websocket/index.ts'),
            },
            formats: ['es'],
        },
        rolldownOptions: {
            external: [/^node:/],
            output: { chunkFileNames: 'chunks/[name]-[hash].js' },
            plugins: [
                dts({
                    tsconfig: './tsconfig.lib.json',
                    tsc: { eager: true },
                    compilerOptions: { types: ['vite/client', 'node'] },
                }),
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
                    exclude: [WORKER_SCOPE_TESTS, NODE_SCOPE_TESTS],
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
                    name: 'node',
                    environment: 'node',
                    include: [NODE_SCOPE_TESTS, 'test/node/**/*.test.ts'],
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
