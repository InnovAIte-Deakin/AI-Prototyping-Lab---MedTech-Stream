type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const level: LogLevel = (import.meta.env.VITE_LOG_LEVEL as LogLevel | undefined) ||
  (import.meta.env.DEV ? 'debug' : 'silent');

const levelOrder: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

function shouldLog(messageLevel: LogLevel) {
  return levelOrder[messageLevel] >= levelOrder[level];
}

export const logger = {
  debug: (...args: unknown[]) => {
    if (shouldLog('debug')) console.debug(...args);
  },
  info: (...args: unknown[]) => {
    if (shouldLog('info')) console.info(...args);
  },
  warn: (...args: unknown[]) => {
    if (shouldLog('warn')) console.warn(...args);
  },
  error: (...args: unknown[]) => {
    if (shouldLog('error')) console.error(...args);
  },
};

export type { LogLevel };
