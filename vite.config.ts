/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import dts from 'vite-plugin-dts'

export default defineConfig({
    plugins: [dts({ tsconfigPath: './tsconfig.app.json' })],
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
        // Ensure Vitest picks up our TS path aliases and runs type checks on type-only tests
        include: ['test/**/*.test.ts', 'test/**/*.spec.ts', 'test/**/*.test-d.ts'],
        typecheck: {
            enabled: true,
            tsconfig: './tsconfig.vitest.json',
        },
    },
})
