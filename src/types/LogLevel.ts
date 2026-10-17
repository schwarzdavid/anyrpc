export const LogLevel = {
    DEBUG: 100,
    INFO: 200,
    WARN: 300,
    ERROR: 400,
    NONE: 9999,
} as const

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel]
