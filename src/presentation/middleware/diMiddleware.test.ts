import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from './diMiddleware';
import { createDIMiddleware, createDIMiddlewareFP, createMiddlewareConfig } from './diMiddleware';
import type { DIContainer, ScopedContainer } from '../../infrastructure/di/types';

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-123'),
}));

// Mock logger
jest.mock('../../infrastructure/logging/logger', () => ({
  RequestScopedLogger: jest.fn().mockImplementation(() => ({
    info: jest.fn(() => () => {}),
    error: jest.fn(() => () => {}),
    warn: jest.fn(() => () => {}),
    debug: jest.fn(() => () => {}),
  })),
}));

describe('DI Middleware', () => {
  let mockContainer: jest.Mocked<DIContainer>;
  let mockScopedContainer: jest.Mocked<ScopedContainer>;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: jest.MockedFunction<NextFunction>;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    mockScopedContainer = {
      resolve: jest.fn(),
      dispose: jest.fn(),
    };

    mockContainer = {
      register: jest.fn(),
      resolve: jest.fn(),
      createScope: jest.fn().mockReturnValue(mockScopedContainer),
    };

    mockReq = {
      get: jest.fn().mockReturnValue('test-user-agent'),
      ip: '127.0.0.1',
      method: 'GET',
      url: '/test',
    };

    mockRes = {
      on: jest.fn(),
      statusCode: 200,
    };

    mockNext = jest.fn();
    consoleSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('createDIMiddleware', () => {
    it('should create middleware that processes request successfully', async () => {
      const middleware = createDIMiddleware(mockContainer);

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockContainer.createScope).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'test-uuid-123',
          startTime: expect.any(Date),
          metadata: expect.objectContaining({
            userAgent: 'test-user-agent',
            ip: '127.0.0.1',
            method: 'GET',
            url: '/test',
          }),
        }),
      );
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should attach container and context to request', async () => {
      const middleware = createDIMiddleware(mockContainer);

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      const authReq = mockReq as AuthenticatedRequest;
      expect(authReq.container).toBe(mockScopedContainer);
      expect(authReq.context).toEqual(
        expect.objectContaining({
          requestId: 'test-uuid-123',
          startTime: expect.any(Date),
        }),
      );
    });

    it('should setup response cleanup handler', async () => {
      const middleware = createDIMiddleware(mockContainer);

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.on).toHaveBeenCalledWith('finish', expect.any(Function));
    });

    it('should handle container creation error', async () => {
      mockContainer.createScope.mockImplementation(() => {
        throw new Error('Container creation failed');
      });

      const middleware = createDIMiddleware(mockContainer);

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(consoleSpy).toHaveBeenCalledWith(
        'DI Middleware error:',
        expect.objectContaining({
          _tag: 'ContainerScopeError',
          message: 'Container creation failed',
        }),
      );
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle unknown errors', async () => {
      mockContainer.createScope.mockImplementation(() => {
        throw 'Unknown error';
      });

      const middleware = createDIMiddleware(mockContainer);

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(consoleSpy).toHaveBeenCalledWith(
        'DI Middleware error:',
        expect.objectContaining({
          _tag: 'ContainerScopeError',
          message: 'Unknown container scope error',
        }),
      );
    });
  });

  describe('Response cleanup', () => {
    it('should dispose scoped container on response finish', async () => {
      const middleware = createDIMiddleware(mockContainer);

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      // Get the finish handler
      const finishHandler = (mockRes.on as jest.Mock).mock.calls.find((call) => call[0] === 'finish')?.[1];

      expect(finishHandler).toBeDefined();

      // Call the finish handler
      await finishHandler();

      expect(mockScopedContainer.dispose).toHaveBeenCalled();
    });

    it('should handle disposal errors gracefully', async () => {
      mockScopedContainer.dispose.mockRejectedValue(new Error('Disposal failed'));

      const middleware = createDIMiddleware(mockContainer);

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      // Get and call the finish handler
      const finishHandler = (mockRes.on as jest.Mock).mock.calls.find((call) => call[0] === 'finish')?.[1];

      // Should not throw
      await expect(finishHandler()).resolves.toBeUndefined();
    });
  });

  describe('createDIMiddlewareFP', () => {
    it('should create functional middleware', async () => {
      const middlewareFP = createDIMiddlewareFP(mockContainer);
      const task = middlewareFP(mockReq as Request, mockRes as Response, mockNext);

      await task();

      expect(mockContainer.createScope).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle errors in functional style', async () => {
      mockContainer.createScope.mockImplementation(() => {
        throw new Error('Container error');
      });

      const middlewareFP = createDIMiddlewareFP(mockContainer);
      const task = middlewareFP(mockReq as Request, mockRes as Response, mockNext);

      await task();

      expect(consoleSpy).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('createMiddlewareConfig', () => {
    it('should create middleware configuration object', () => {
      const config = createMiddlewareConfig(mockContainer);

      expect(config.container).toBe(mockContainer);
      expect(typeof config.middleware).toBe('function');
      expect(typeof config.middlewareFP).toBe('function');
    });

    it('should create working middleware functions', async () => {
      const config = createMiddlewareConfig(mockContainer);

      // Test regular middleware
      await config.middleware(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();

      mockNext.mockClear();

      // Test functional middleware
      const task = config.middlewareFP(mockReq as Request, mockRes as Response, mockNext);
      await task();
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Request context creation', () => {
    it('should create request context with correct metadata', async () => {
      mockReq = {
        ...mockReq,
        get: jest.fn((header) => {
          if (header === 'User-Agent') return 'Mozilla/5.0';
          return undefined;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any,
        ip: '192.168.1.1',
        method: 'POST',
        url: '/api/users',
      };

      const middleware = createDIMiddleware(mockContainer);

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockContainer.createScope).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'test-uuid-123',
          startTime: expect.any(Date),
          metadata: {
            userAgent: 'Mozilla/5.0',
            ip: '192.168.1.1',
            method: 'POST',
            url: '/api/users',
          },
        }),
      );
    });

    it('should handle missing user agent', async () => {
      mockReq = {
        ...mockReq,
        get: jest.fn().mockReturnValue(undefined),
      };

      const middleware = createDIMiddleware(mockContainer);

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockContainer.createScope).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            userAgent: undefined,
          }),
        }),
      );
    });
  });

  describe('Error handling', () => {
    it('should handle ContainerScopeError', async () => {
      mockContainer.createScope.mockImplementation(() => {
        throw new Error('Scope creation failed');
      });

      const middleware = createDIMiddleware(mockContainer);

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Failed to create request scope',
        }),
      );
    });
  });

  describe('AuthenticatedRequest interface', () => {
    it('should extend Request with container and context', async () => {
      // Use the shared mocks but create a fresh request object
      const testReq = {
        get: jest.fn().mockReturnValue('test-user-agent'),
        ip: '127.0.0.1',
        method: 'GET',
        url: '/test',
      } as unknown as Request;

      const middleware = createDIMiddleware(mockContainer);

      await middleware(testReq, mockRes as Response, mockNext);

      // Check if next was called with an error
      if (mockNext.mock.calls.length > 0 && mockNext.mock.calls[0][0]) {
        console.log('Middleware called next with error:', mockNext.mock.calls[0][0]);
      }

      // Verify the request object has been extended with container and context
      const authReq = testReq as AuthenticatedRequest;
      expect(authReq).toHaveProperty('container');
      expect(authReq).toHaveProperty('context');
      expect(authReq.container).toBe(mockScopedContainer);
      expect(authReq.context).toHaveProperty('requestId');
      expect(authReq.context).toHaveProperty('startTime');
      expect(authReq.context).toHaveProperty('metadata');
    });
  });
});
