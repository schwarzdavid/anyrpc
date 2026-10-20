import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

interface PackageExport {
    types: string
    import: string
    require: string
}

const ROOT = fileURLToPath(new URL('../../', import.meta.url))

const EXPECTED_EXPORTS: Record<string, string[]> = {
    '.': [
        'createRpcChannel',
        'createRpcHub',
        'AbstractRpcHubAdapter',
        'AbstractRpcAdapter',
        'ConnectionStatus',
        'LogLevel',
        'RpcError',
        'RpcErrorCode',
    ],
    './adapters/iframe': ['IFrameHostAdapter', 'IFrameClientAdapter'],
    './adapters/message-port': [
        'AbstractMessagePortAdapter',
        'AbstractMessagePortHostAdapter',
        'AbstractMessagePortClientAdapter',
    ],
    './adapters/web-worker': ['WebWorkerHostAdapter', 'WebWorkerClientAdapter', 'SharedWorkerHubAdapter'],
    './adapters/node-worker': ['NodeWorkerHostAdapter', 'NodeWorkerClientAdapter'],
    './adapters/socket': ['AbstractSocketAdapter'],
}

function readPackageExports(): Record<string, PackageExport> {
    const packageJson = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
        exports: Record<string, PackageExport>
    }
    return packageJson.exports
}

function distPath(subpath: string, kind: keyof PackageExport): string {
    return resolve(ROOT, readPackageExports()[subpath]![kind])
}

describe.skipIf(!existsSync(resolve(ROOT, 'dist')))('package exports', () => {
    const entries = Object.entries(EXPECTED_EXPORTS)

    it('should describe every entry point', () => {
        expect(Object.keys(readPackageExports())).toStrictEqual(Object.keys(EXPECTED_EXPORTS))
    })

    it.each(entries)('should resolve %s as ES module', async (subpath, names) => {
        const module = (await import(pathToFileURL(distPath(subpath, 'import')).href)) as Record<string, unknown>

        expect(Object.keys(module)).toStrictEqual(expect.arrayContaining(names))
    })

    it.each(entries)('should resolve %s as CommonJS module', (subpath, names) => {
        const module = createRequire(import.meta.url)(distPath(subpath, 'require')) as Record<string, unknown>

        expect(Object.keys(module)).toStrictEqual(expect.arrayContaining(names))
    })

    it.each(entries)('should ship type declarations for %s', (subpath) => {
        expect(existsSync(distPath(subpath, 'types'))).toBe(true)
    })
})
