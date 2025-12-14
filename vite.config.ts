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
        ],
    },
})
