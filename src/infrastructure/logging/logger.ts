import type * as IO from 'fp-ts/lib/IO';
import type { Logger } from '../../application/ports';
import type { RequestContext } from '../di/types';

export interface LogEntry {
  timestamp: Date;
  level: 'info' | 'error' | 'warn' | 'debug';
  message: string;
  context?: object;
  requestId?: string;
  error?: Error;
}

export interface LoggerConfig {
  level: 'info' | 'error' | 'warn' | 'debug';
  format: 'json' | 'text';
}

export class RequestScopedLogger implements Logger {
  constructor(
    private requestContext: RequestContext,
    private config: LoggerConfig = { level: 'info', format: 'json' },
  ) {}

  info =
    (message: string, context?: object): IO.IO<void> =>
    () => {
      this.log({
        timestamp: new Date(),
        level: 'info',
        message,
        context,
        requestId: this.requestContext.requestId,
      });
    };

  error =
    (message: string, error: Error, context?: object): IO.IO<void> =>
    () => {
      this.log({
        timestamp: new Date(),
        level: 'error',
        message,
        error,
        context,
        requestId: this.requestContext.requestId,
      });
    };

  warn =
    (message: string, context?: object): IO.IO<void> =>
    () => {
      this.log({
        timestamp: new Date(),
        level: 'warn',
        message,
        context,
        requestId: this.requestContext.requestId,
      });
    };

  debug =
    (message: string, context?: object): IO.IO<void> =>
    () => {
      this.log({
        timestamp: new Date(),
        level: 'debug',
        message,
        context,
        requestId: this.requestContext.requestId,
      });
    };

  private log(entry: LogEntry): void {
    if (this.config.format === 'json') {
      console.log(
        JSON.stringify({
          ...entry,
          error: entry.error
            ? {
                message: entry.error.message,
                stack: entry.error.stack,
                name: entry.error.name,
              }
            : undefined,
        }),
      );
    } else {
      const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
      const errorStr = entry.error ? ` Error: ${entry.error.message}` : '';
      console.log(
        `[${entry.timestamp.toISOString()}] ${entry.level.toUpperCase()} [${entry.requestId}] ${entry.message}${contextStr}${errorStr}`,
      );
    }
  }
}

export class SingletonLogger implements Logger {
  constructor(private config: LoggerConfig = { level: 'info', format: 'json' }) {}

  info =
    (message: string, context?: object): IO.IO<void> =>
    () => {
      this.log({
        timestamp: new Date(),
        level: 'info',
        message,
        context,
      });
    };

  error =
    (message: string, error: Error, context?: object): IO.IO<void> =>
    () => {
      this.log({
        timestamp: new Date(),
        level: 'error',
        message,
        error,
        context,
      });
    };

  warn =
    (message: string, context?: object): IO.IO<void> =>
    () => {
      this.log({
        timestamp: new Date(),
        level: 'warn',
        message,
        context,
      });
    };

  debug =
    (message: string, context?: object): IO.IO<void> =>
    () => {
      this.log({
        timestamp: new Date(),
        level: 'debug',
        message,
        context,
      });
    };

  private log(entry: LogEntry): void {
    if (this.config.format === 'json') {
      console.log(
        JSON.stringify({
          ...entry,
          error: entry.error
            ? {
                message: entry.error.message,
                stack: entry.error.stack,
                name: entry.error.name,
              }
            : undefined,
        }),
      );
    } else {
      const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
      const errorStr = entry.error ? ` Error: ${entry.error.message}` : '';
      console.log(
        `[${entry.timestamp.toISOString()}] ${entry.level.toUpperCase()} ${entry.message}${contextStr}${errorStr}`,
      );
    }
  }
}
