import * as E from 'fp-ts/lib/Either';

// Mock express app
const mockApp = {
  use: jest.fn(),
  get: jest.fn(),
  listen: jest.fn(),
};

// Mock express functions
const mockExpress = jest.fn(() => mockApp) as unknown as jest.MockedFunction<typeof import('express')>;
mockExpress.json = jest.fn();
mockExpress.urlencoded = jest.fn();

// Mock dependencies
jest.mock('../infrastructure/di/container');
jest.mock('../infrastructure/di/registry');
jest.mock('./middleware/diMiddleware');
jest.mock('./rest/routes/userRoutes');

// Mock express
jest.mock('express', () => mockExpress);

// Import after mocking
import { ApplicationServer, createServer, createAndStartServer } from './server';

describe('ApplicationServer', () => {
  let server: ApplicationServer;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    server = new ApplicationServer();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('start', () => {
    it('should start server successfully', async () => {
      // Mock successful listen
      mockApp.listen.mockImplementation((port: number, callback: () => void) => {
        callback();
        return { close: jest.fn() };
      });

      const result = await server.start(3000);

      expect(E.isRight(result)).toBe(true);
      expect(mockApp.listen).toHaveBeenCalledWith(3000, expect.any(Function));
      expect(consoleSpy).toHaveBeenCalledWith('🚀 Server running on port 3000');
    });

    it('should start server with default port', async () => {
      mockApp.listen.mockImplementation((port: number, callback: () => void) => {
        callback();
        return { close: jest.fn() };
      });

      const result = await server.start();

      expect(E.isRight(result)).toBe(true);
      expect(mockApp.listen).toHaveBeenCalledWith(3000, expect.any(Function));
    });

    it('should handle server start error', async () => {
      mockApp.listen.mockImplementation(() => {
        throw new Error('Port already in use');
      });

      const result = await server.start(3000);

      expect(result).toEqual(E.left({
        _tag: 'ServerStartError',
        message: 'Port already in use',
        port: 3000,
      }));
    });

    it('should log all server endpoints on successful start', async () => {
      mockApp.listen.mockImplementation((port: number, callback: () => void) => {
        callback();
        return { close: jest.fn() };
      });

      await server.start(8080);

      expect(consoleSpy).toHaveBeenCalledWith('🚀 Server running on port 8080');
      expect(consoleSpy).toHaveBeenCalledWith('📡 REST API: http://localhost:8080/api');
      expect(consoleSpy).toHaveBeenCalledWith('❤️ Health: http://localhost:8080/health');
      expect(consoleSpy).toHaveBeenCalledWith('📚 API Docs: http://localhost:8080/api');
    });
  });

  describe('stop', () => {
    it('should stop server successfully when running', async () => {
      // Start server first
      mockApp.listen.mockImplementation((port: number, callback: () => void) => {
        callback();
        return { close: jest.fn() };
      });

      await server.start(3000);
      const result = await server.stop();

      expect(E.isRight(result)).toBe(true);
    });

    it('should handle stop when server is not running', async () => {
      const result = await server.stop();

      expect(E.isRight(result)).toBe(true);
    });
  });

  describe('getState', () => {
    it('should return null when server is not started', () => {
      const state = server.getState();
      expect(state).toBeNull();
    });

    it('should return server state when server is started', async () => {
      mockApp.listen.mockImplementation((port: number, callback: () => void) => {
        callback();
        return { close: jest.fn() };
      });

      await server.start(3000);
      const state = server.getState();

      expect(state).not.toBeNull();
      expect(state?.config.port).toBe(3000);
    });
  });
});

describe('Express App Setup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should setup basic middleware', async () => {
    mockApp.listen.mockImplementation((port: number, callback: () => void) => {
      callback();
      return { close: jest.fn() };
    });

    const server = new ApplicationServer();
    await server.start(3000);

    // Verify express middleware setup
    expect(mockApp.use).toHaveBeenCalled();
  });

  it('should setup health endpoint', async () => {
    mockApp.listen.mockImplementation((port: number, callback: () => void) => {
      callback();
      return { close: jest.fn() };
    });

    const server = new ApplicationServer();
    await server.start(3000);

    // Verify health endpoint is registered
    expect(mockApp.get).toHaveBeenCalledWith('/health', expect.any(Function));
  });

  it('should setup API docs endpoint', async () => {
    mockApp.listen.mockImplementation((port: number, callback: () => void) => {
      callback();
      return { close: jest.fn() };
    });

    const server = new ApplicationServer();
    await server.start(3000);

    // Verify API docs endpoint is registered
    expect(mockApp.get).toHaveBeenCalledWith('/api', expect.any(Function));
  });

  it('should handle CORS preflight requests', async () => {
    mockApp.listen.mockImplementation((port: number, callback: () => void) => {
      callback();
      return { close: jest.fn() };
    });

    const server = new ApplicationServer();
    await server.start(3000);

    // Get the CORS middleware function
    const corsMiddleware = mockApp.use.mock.calls.find(call =>
      typeof call[0] === 'function' && call[0].length === 3,
    )?.[0];

    expect(corsMiddleware).toBeDefined();

    // Test CORS middleware with OPTIONS request
    const mockReq = { method: 'OPTIONS' };
    const mockRes = {
      header: jest.fn(),
      sendStatus: jest.fn(),
    };
    const mockNext = jest.fn();

    corsMiddleware(mockReq, mockRes, mockNext);

    expect(mockRes.header).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
    expect(mockRes.sendStatus).toHaveBeenCalledWith(200);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should handle non-OPTIONS requests in CORS middleware', async () => {
    mockApp.listen.mockImplementation((port: number, callback: () => void) => {
      callback();
      return { close: jest.fn() };
    });

    const server = new ApplicationServer();
    await server.start(3000);

    // Get the CORS middleware function
    const corsMiddleware = mockApp.use.mock.calls.find(call =>
      typeof call[0] === 'function' && call[0].length === 3,
    )?.[0];

    expect(corsMiddleware).toBeDefined();

    // Test CORS middleware with GET request
    const mockReq = { method: 'GET' };
    const mockRes = {
      header: jest.fn(),
      sendStatus: jest.fn(),
    };
    const mockNext = jest.fn();

    corsMiddleware(mockReq, mockRes, mockNext);

    expect(mockRes.header).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.sendStatus).not.toHaveBeenCalled();
  });
});

describe('Health Endpoint', () => {
  it('should return health status', async () => {
    mockApp.listen.mockImplementation((port: number, callback: () => void) => {
      callback();
      return { close: jest.fn() };
    });

    const server = new ApplicationServer();
    await server.start(3000);

    // Get the health endpoint handler
    const healthHandler = mockApp.get.mock.calls.find(call => call[0] === '/health')?.[1];
    expect(healthHandler).toBeDefined();

    const mockReq = {};
    const mockRes = {
      json: jest.fn(),
    };

    healthHandler(mockReq, mockRes);

    expect(mockRes.json).toHaveBeenCalledWith({
      status: 'healthy',
      timestamp: expect.any(String),
      services: {
        rest: 'available at /api',
        endpoints: {
          'POST /api/users': 'Create a new user',
          'GET /api/users/:id': 'Get user by ID',
        },
      },
    });
  });
});

describe('API Docs Endpoint', () => {
  it('should return API documentation', async () => {
    mockApp.listen.mockImplementation((port: number, callback: () => void) => {
      callback();
      return { close: jest.fn() };
    });

    const server = new ApplicationServer();
    await server.start(3000);

    // Get the API docs endpoint handler
    const apiDocsHandler = mockApp.get.mock.calls.find(call => call[0] === '/api')?.[1];
    expect(apiDocsHandler).toBeDefined();

    const mockReq = {};
    const mockRes = {
      json: jest.fn(),
    };

    apiDocsHandler(mockReq, mockRes);

    expect(mockRes.json).toHaveBeenCalledWith({
      name: 'Clean Architecture API',
      version: '1.0.0',
      description: 'API built with Clean Architecture principles and DI',
      endpoints: {
        'POST /api/users': {
          description: 'Create a new user',
          body: {
            email: 'string (required)',
            name: 'string (required)',
            password: 'string (required, min 6 chars)',
          },
        },
        'GET /api/users/:id': {
          description: 'Get user by ID',
          params: {
            id: 'string (required)',
          },
        },
      },
    });
  });
});

describe('Error Handling Middleware', () => {
  it('should handle errors and return 500 status', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    mockApp.listen.mockImplementation((port: number, callback: () => void) => {
      callback();
      return { close: jest.fn() };
    });

    const server = new ApplicationServer();
    await server.start(3000);

    // Get the error handling middleware
    const errorHandler = mockApp.use.mock.calls.find(call =>
      typeof call[0] === 'function' && call[0].length === 4,
    )?.[0];

    expect(errorHandler).toBeDefined();

    const error = new Error('Test error');
    const mockReq = { context: { requestId: 'test-123' } };
    const mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const mockNext = jest.fn();

    errorHandler(error, mockReq, mockRes, mockNext);

    expect(consoleErrorSpy).toHaveBeenCalledWith('Unhandled error:', error);
    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: false,
      error: 'Internal server error',
      requestId: 'test-123',
    });

    consoleErrorSpy.mockRestore();
  });
});

describe('Factory Functions', () => {
  describe('createServer', () => {
    it('should create a new ApplicationServer instance', () => {
      const serverFactory = createServer();
      const server = serverFactory();

      expect(server).toBeInstanceOf(ApplicationServer);
    });
  });

  describe('createAndStartServer', () => {
    it('should create and start server successfully', async () => {
      mockApp.listen.mockImplementation((port: number, callback: () => void) => {
        callback();
        return { close: jest.fn() };
      });

      const result = await createAndStartServer(3000)();

      expect(E.isRight(result)).toBe(true);
      if (E.isRight(result)) {
        expect(result.right).toBeInstanceOf(ApplicationServer);
      }
    });

    it('should handle server start failure', async () => {
      mockApp.listen.mockImplementation(() => {
        throw new Error('Server start failed');
      });

      const result = await createAndStartServer(3000)();

      expect(E.isLeft(result)).toBe(true);
    });
  });
});
