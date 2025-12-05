import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import dts from 'vite-plugin-dts'

export default defineConfig({
    plugins: [
        dts({
            include: ['src'],
            rollupTypes: true,
        }),
    ],
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
                chunkFileNames: '[name]-[hash].js',
            },
        },
    },
})
