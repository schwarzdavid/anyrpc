import { afterEach, describe, expect, it, vi } from 'vitest'
import { Logger } from '@/lib/Logger'
import { LogLevel } from '@/types/LogLevel'

describe(Logger, () => {
    const logSpy = vi.spyOn(console, 'log')
    const warnSpy = vi.spyOn(console, 'warn')
    const errorSpy = vi.spyOn(console, 'error')

    afterEach(() => {
        vi.clearAllMocks()
    })

    it('should use console.log on debug', () => {
        const logger = new Logger('LoggerTest', LogLevel.DEBUG)

        logger.debug('test')

        expect(logSpy).toHaveBeenCalledTimes(1)
        expect(warnSpy).toHaveBeenCalledTimes(0)
        expect(errorSpy).toHaveBeenCalledTimes(0)
    })

    it('should use console.log on info', () => {
        const logger = new Logger('LoggerTest', LogLevel.DEBUG)

        logger.info('test')

        expect(logSpy).toHaveBeenCalledTimes(1)
        expect(warnSpy).toHaveBeenCalledTimes(0)
        expect(errorSpy).toHaveBeenCalledTimes(0)
    })

    it('should use console.warn on warn', () => {
        const logger = new Logger('LoggerTest', LogLevel.DEBUG)

        logger.warn('test')

        expect(logSpy).toHaveBeenCalledTimes(0)
        expect(warnSpy).toHaveBeenCalledTimes(1)
        expect(errorSpy).toHaveBeenCalledTimes(0)
    })

    it('should use console.error on error', () => {
        const logger = new Logger('LoggerTest', LogLevel.DEBUG)

        logger.error('test')

        expect(logSpy).toHaveBeenCalledTimes(0)
        expect(warnSpy).toHaveBeenCalledTimes(0)
        expect(errorSpy).toHaveBeenCalledTimes(1)
    })

    it('should prepend prefix and pass all other arguments to console method', () => {
        const logger = new Logger('LoggerTest', LogLevel.DEBUG)

        logSpy.mockImplementationOnce((prefix, ...logArgs) => {
            expect(prefix).toStrictEqual(expect.any(String))
            expect(logArgs).toStrictEqual(args)
        })

        const args = ['test', 1, { foo: 'bar' }]

        logger.debug(...args)
    })

    it('should log all if log level is set to debug', () => {
        const logger = new Logger('LoggerTest', LogLevel.DEBUG)

        logger.debug('test')
        logger.info('test')
        logger.warn('test')
        logger.error('test')

        expect(logSpy).toHaveBeenCalledTimes(2)
        expect(warnSpy).toHaveBeenCalledTimes(1)
        expect(errorSpy).toHaveBeenCalledTimes(1)
    })

    it('should only log info and higher if log level is set to info', () => {
        const logger = new Logger('LoggerTest', LogLevel.INFO)

        logger.debug('test')
        logger.info('test')
        logger.warn('test')
        logger.error('test')

        expect(logSpy).toHaveBeenCalledTimes(1)
        expect(warnSpy).toHaveBeenCalledTimes(1)
        expect(errorSpy).toHaveBeenCalledTimes(1)
    })

    it('should only log warnings and higher if log level is set to warn', () => {
        const logger = new Logger('LoggerTest', LogLevel.WARN)

        logger.debug('test')
        logger.info('test')
        logger.warn('test')
        logger.error('test')

        expect(logSpy).toHaveBeenCalledTimes(0)
        expect(warnSpy).toHaveBeenCalledTimes(1)
        expect(errorSpy).toHaveBeenCalledTimes(1)
    })

    it('should only log errors if log level is set to error', () => {
        const logger = new Logger('LoggerTest', LogLevel.ERROR)

        logger.debug('test')
        logger.info('test')
        logger.warn('test')
        logger.error('test')

        expect(logSpy).toHaveBeenCalledTimes(0)
        expect(warnSpy).toHaveBeenCalledTimes(0)
        expect(errorSpy).toHaveBeenCalledTimes(1)
    })

    it('should log nothing if log level is set to none', () => {
        const logger = new Logger('LoggerTest', LogLevel.NONE)

        logger.debug('test')
        logger.info('test')
        logger.warn('test')
        logger.error('test')

        expect(logSpy).toHaveBeenCalledTimes(0)
        expect(warnSpy).toHaveBeenCalledTimes(0)
        expect(errorSpy).toHaveBeenCalledTimes(0)
    })
})
