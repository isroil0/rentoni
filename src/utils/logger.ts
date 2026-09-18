import { env } from '../config/env';

type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = env.isTest ? ORDER.error : env.isProd ? ORDER.info : ORDER.debug;

function emit(level: Level, message: string, meta?: unknown) {
  if (ORDER[level] < threshold) return;
  const line = { ts: new Date().toISOString(), level, message, ...(meta ? { meta } : {}) };
  const out = level === 'error' || level === 'warn' ? console.error : console.log;
  out(env.isProd ? JSON.stringify(line) : `[${line.level.toUpperCase()}] ${message}`, meta ?? '');
}

export const logger = {
  debug: (m: string, meta?: unknown) => emit('debug', m, meta),
  info: (m: string, meta?: unknown) => emit('info', m, meta),
  warn: (m: string, meta?: unknown) => emit('warn', m, meta),
  error: (m: string, meta?: unknown) => emit('error', m, meta),
};
