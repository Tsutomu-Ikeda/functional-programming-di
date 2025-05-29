import { RequestScopedLogger, SingletonLogger, LoggerConfig, LogEntry } from './logger';
import { RequestContext } from '../di/types';

describe('Logger', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('RequestScopedLogger', () => {
    let logger: RequestScopedLogger;
    let requestContext: RequestContext;

    beforeEach(() => {
      requestContext = {
        requestId: 'test-request-123',
        startTime: new Date(),
        metadata: { userId: 'user-123' }
      };
    });

    describe('with JSON format', () => {
      beforeEach(() => {
        const config: LoggerConfig = { level: 'info', format: 'json' };
        logger = new RequestScopedLogger(requestContext, config);
      });

      it('should log info message in JSON format', () => {
        const context = { action: 'test' };
        logger.info('Test info message', context)();

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('"level":"info"')
        );
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('"message":"Test info message"')
        );
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('"requestId":"test-request-123"')
        );
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('"context":{"action":"test"}')
        );
      });

      it('should log info message without context', () => {
        logger.info('Test info message')();

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('"message":"Test info message"')
        );
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('"requestId":"test-request-123"')
        );
      });

      it('should log error message with error object', () => {
        const error = new Error('Test error');
        error.stack = 'Error stack trace';
        const context = { component: 'test' };

        logger.error('Test error message', error, context)();

        const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
        expect(loggedData.level).toBe('error');
        expect(loggedData.message).toBe('Test error message');
        expect(loggedData.requestId).toBe('test-request-123');
        expect(loggedData.context).toEqual({ component: 'test' });
        expect(loggedData.error.message).toBe('Test error');
        expect(loggedData.error.stack).toBe('Error stack trace');
        expect(loggedData.error.name).toBe('Error');
      });

      it('should log warn message', () => {
        const context = { warning: 'deprecated' };
        logger.warn('Test warning message', context)();

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('"level":"warn"')
        );
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('"message":"Test warning message"')
        );
      });

      it('should log debug message', () => {
        const context = { debug: 'info' };
        logger.debug('Test debug message', context)();

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('"level":"debug"')
        );
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('"message":"Test debug message"')
        );
      });
    });

    describe('with text format', () => {
      beforeEach(() => {
        const config: LoggerConfig = { level: 'info', format: 'text' };
        logger = new RequestScopedLogger(requestContext, config);
      });

      it('should log info message in text format', () => {
        const context = { action: 'test' };
        logger.info('Test info message', context)();

        const logOutput = consoleSpy.mock.calls[0][0];
        expect(logOutput).toMatch(/\[.*\] INFO \[test-request-123\] Test info message {"action":"test"}/);
      });

      it('should log info message without context in text format', () => {
        logger.info('Test info message')();

        const logOutput = consoleSpy.mock.calls[0][0];
        expect(logOutput).toMatch(/\[.*\] INFO \[test-request-123\] Test info message$/);
      });

      it('should log error message with error in text format', () => {
        const error = new Error('Test error');
        logger.error('Test error message', error)();

        const logOutput = consoleSpy.mock.calls[0][0];
        expect(logOutput).toMatch(/\[.*\] ERROR \[test-request-123\] Test error message Error: Test error/);
      });

      it('should log warn message in text format', () => {
        logger.warn('Test warning message')();

        const logOutput = consoleSpy.mock.calls[0][0];
        expect(logOutput).toMatch(/\[.*\] WARN \[test-request-123\] Test warning message$/);
      });

      it('should log debug message in text format', () => {
        logger.debug('Test debug message')();

        const logOutput = consoleSpy.mock.calls[0][0];
        expect(logOutput).toMatch(/\[.*\] DEBUG \[test-request-123\] Test debug message$/);
      });
    });

    describe('with default config', () => {
      beforeEach(() => {
        logger = new RequestScopedLogger(requestContext);
      });

      it('should use default JSON format', () => {
        logger.info('Test message')();

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('"level":"info"')
        );
      });
    });
  });

  describe('SingletonLogger', () => {
    let logger: SingletonLogger;

    describe('with JSON format', () => {
      beforeEach(() => {
        const config: LoggerConfig = { level: 'info', format: 'json' };
        logger = new SingletonLogger(config);
      });

      it('should log info message in JSON format without requestId', () => {
        const context = { action: 'test' };
        logger.info('Test info message', context)();

        const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
        expect(loggedData.level).toBe('info');
        expect(loggedData.message).toBe('Test info message');
        expect(loggedData.context).toEqual({ action: 'test' });
        expect(loggedData.requestId).toBeUndefined();
      });

      it('should log error message with error object', () => {
        const error = new Error('Test error');
        error.stack = 'Error stack trace';

        logger.error('Test error message', error)();

        const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
        expect(loggedData.level).toBe('error');
        expect(loggedData.message).toBe('Test error message');
        expect(loggedData.error.message).toBe('Test error');
        expect(loggedData.error.stack).toBe('Error stack trace');
        expect(loggedData.error.name).toBe('Error');
      });

      it('should log warn message', () => {
        logger.warn('Test warning message')();

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('"level":"warn"')
        );
      });

      it('should log debug message', () => {
        logger.debug('Test debug message')();

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('"level":"debug"')
        );
      });
    });

    describe('with text format', () => {
      beforeEach(() => {
        const config: LoggerConfig = { level: 'info', format: 'text' };
        logger = new SingletonLogger(config);
      });

      it('should log info message in text format without requestId', () => {
        const context = { action: 'test' };
        logger.info('Test info message', context)();

        const logOutput = consoleSpy.mock.calls[0][0];
        expect(logOutput).toMatch(/\[.*\] INFO Test info message {"action":"test"}/);
        expect(logOutput).not.toContain('[test-request-123]');
      });

      it('should log error message with error in text format', () => {
        const error = new Error('Test error');
        logger.error('Test error message', error)();

        const logOutput = consoleSpy.mock.calls[0][0];
        expect(logOutput).toMatch(/\[.*\] ERROR Test error message Error: Test error/);
      });

      it('should log message without context or error', () => {
        logger.info('Simple message')();

        const logOutput = consoleSpy.mock.calls[0][0];
        expect(logOutput).toMatch(/\[.*\] INFO Simple message$/);
      });
    });

    describe('with default config', () => {
      beforeEach(() => {
        logger = new SingletonLogger();
      });

      it('should use default JSON format', () => {
        logger.info('Test message')();

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('"level":"info"')
        );
      });
    });
  });

  describe('LogEntry interface', () => {
    it('should accept valid log entry', () => {
      const logEntry: LogEntry = {
        timestamp: new Date(),
        level: 'info',
        message: 'Test message',
        context: { key: 'value' },
        requestId: 'req-123',
        error: new Error('Test error')
      };

      expect(logEntry.timestamp).toBeInstanceOf(Date);
      expect(logEntry.level).toBe('info');
      expect(logEntry.message).toBe('Test message');
      expect(logEntry.context).toEqual({ key: 'value' });
      expect(logEntry.requestId).toBe('req-123');
      expect(logEntry.error).toBeInstanceOf(Error);
    });
  });

  describe('LoggerConfig interface', () => {
    it('should accept valid logger config', () => {
      const config: LoggerConfig = {
        level: 'debug',
        format: 'text'
      };

      expect(config.level).toBe('debug');
      expect(config.format).toBe('text');
    });
  });
});
