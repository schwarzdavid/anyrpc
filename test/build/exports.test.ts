import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

interface PackageExport {
    types: string
    default: string
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
        'AbstractMessagePortResponderAdapter',
        'AbstractMessagePortInitiatorAdapter',
    ],
    './adapters/web-worker': ['WebWorkerHostAdapter', 'WebWorkerClientAdapter', 'SharedWorkerHubAdapter'],
    './adapters/node-worker': ['NodeWorkerHostAdapter', 'NodeWorkerClientAdapter'],
    './adapters/child-process': ['ChildProcessHostAdapter', 'ChildProcessClientAdapter'],
    './adapters/socket': ['AbstractSocketAdapter'],
    './adapters/websocket': ['WebSocketClientAdapter', 'WebSocketHubAdapter'],
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
        const module = (await import(pathToFileURL(distPath(subpath, 'default')).href)) as Record<string, unknown>

        expect(Object.keys(module)).toStrictEqual(expect.arrayContaining(names))
    })

    it.each(entries)('should let CommonJS code require %s', (subpath, names) => {
        const module = createRequire(import.meta.url)(distPath(subpath, 'default')) as Record<string, unknown>

        expect(Object.keys(module)).toStrictEqual(expect.arrayContaining(names))
    })

    it.each(entries)('should ship type declarations for %s', (subpath) => {
        expect(existsSync(distPath(subpath, 'types'))).toBe(true)
    })

    it.each(entries)('should import other declarations of %s with a file extension', (subpath) => {
        const declarations = readFileSync(distPath(subpath, 'types'), 'utf8')
        const relativeImports = [...declarations.matchAll(/from '(\.[^']*)'/g)].map(([, specifier]) => specifier)

        expect(relativeImports).not.toHaveLength(0)
        expect(relativeImports.filter((specifier) => !specifier?.endsWith('.js'))).toStrictEqual([])
    })
})
