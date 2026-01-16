import { LogLevel } from '@/types/LogLevel'

export class Logger {
    constructor(
        private readonly name: string,
        private readonly level: LogLevel,
    ) {}

    debug(...args: unknown[]): void {
        this.printMessage(LogLevel.DEBUG, ...args)
    }

    info(...args: unknown[]): void {
        this.printMessage(LogLevel.INFO, ...args)
    }

    warn(...args: unknown[]): void {
        this.printMessage(LogLevel.WARN, ...args)
    }

    error(...args: unknown[]): void {
        this.printMessage(LogLevel.ERROR, ...args)
    }

    private printMessage(level: LogLevel, ...args: unknown[]): void {
        const logFn = this.getLogFn(level)

        if (this.level <= level) {
            logFn(`[${this.name}]`, ...args)
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private getLogFn(level: LogLevel): (...data: any[]) => void {
        switch (level) {
            case LogLevel.ERROR:
                return console.error
            case LogLevel.WARN:
                return console.warn
            default:
                return console.log
        }
    }
}
