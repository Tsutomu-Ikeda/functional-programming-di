// Mock console methods
const consoleSpy = {
  log: jest.spyOn(console, 'log').mockImplementation(),
  error: jest.spyOn(console, 'error').mockImplementation(),
};

// Mock process methods
const processExitSpy = jest.spyOn(process, 'exit').mockImplementation();
const processOnSpy = jest.spyOn(process, 'on').mockImplementation();

// Mock the server
const mockServer = {
  start: jest.fn(),
  stop: jest.fn(),
};

const mockCreateServer = jest.fn(() => () => mockServer);

// Mock the server module before importing main
jest.mock('./presentation/server', () => ({
  createServer: mockCreateServer,
}));

describe('main.ts', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    jest.clearAllMocks();
    originalEnv = process.env;
    mockServer.start.mockClear();
    mockServer.stop.mockClear();
    mockCreateServer.mockClear();
    consoleSpy.log.mockClear();
    consoleSpy.error.mockClear();
    processExitSpy.mockClear();
    processOnSpy.mockClear();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.resetModules();
  });

  describe('main function', () => {
    it('should start server successfully with default port', async () => {
      const { right } = await import('fp-ts/lib/Either');
      mockServer.start.mockResolvedValue(right(undefined));

      // Import main to execute it
      await import('./main');

      expect(mockServer.start).toHaveBeenCalledWith(3000);
      expect(consoleSpy.log).toHaveBeenCalledWith('🔧 Initializing Clean Architecture Application...');
      expect(consoleSpy.log).toHaveBeenCalledWith('✅ Application started successfully!');
    });

    it('should start server with custom port from environment', async () => {
      const { right } = await import('fp-ts/lib/Either');
      process.env.PORT = '8080';
      mockServer.start.mockResolvedValue(right(undefined));

      await import('./main');

      expect(mockServer.start).toHaveBeenCalledWith(8080);
    });

    it('should handle server start failure', async () => {
      const { left } = await import('fp-ts/lib/Either');
      const error = new Error('Server failed to start');
      mockServer.start.mockResolvedValue(left(error));

      await import('./main');

      expect(consoleSpy.error).toHaveBeenCalledWith('❌ Failed to start server:', error);
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle main function exception', async () => {
      mockCreateServer.mockImplementation(() => {
        throw new Error('Server creation failed');
      });

      await import('./main');

      expect(consoleSpy.error).toHaveBeenCalledWith('❌ Failed to start application:', expect.any(Error));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should setup graceful shutdown handlers', async () => {
      const { right } = await import('fp-ts/lib/Either');
      mockServer.start.mockResolvedValue(right(undefined));

      await import('./main');

      expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    });

    it('should handle graceful shutdown successfully', async () => {
      const { right } = await import('fp-ts/lib/Either');
      mockServer.start.mockResolvedValue(right(undefined));
      mockServer.stop.mockResolvedValue(right(undefined));

      const mainModule = await import('./main');

      // Ensure the mocked server is set as the global server
      mainModule.setGlobalServer(mockServer);

      // Get the shutdown handler
      const shutdownHandler = processOnSpy.mock.calls.find(call => call[0] === 'SIGINT')?.[1] as Function;
      expect(shutdownHandler).toBeDefined();

      // Call shutdown handler
      await shutdownHandler();

      expect(consoleSpy.log).toHaveBeenCalledWith('\n🛑 Shutting down gracefully...');
      expect(mockServer.stop).toHaveBeenCalled();
      expect(consoleSpy.log).toHaveBeenCalledWith('✅ Server stopped successfully');
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('should handle graceful shutdown failure', async () => {
      const { right, left } = await import('fp-ts/lib/Either');
      const error = new Error('Shutdown failed');
      mockServer.start.mockResolvedValue(right(undefined));
      mockServer.stop.mockResolvedValue(left(error));

      const mainModule = await import('./main');

      // Ensure the mocked server is set as the global server
      mainModule.setGlobalServer(mockServer);

      // Get the shutdown handler
      const shutdownHandler = processOnSpy.mock.calls.find(call => call[0] === 'SIGINT')?.[1] as Function;

      // Call shutdown handler
      await shutdownHandler();

      expect(consoleSpy.error).toHaveBeenCalledWith('❌ Error during shutdown:', error);
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('process error handlers', () => {
    it('should handle unhandled promise rejection', async () => {
      await import('./main');

      // Get the unhandledRejection handler
      const rejectionHandler = processOnSpy.mock.calls.find(call => call[0] === 'unhandledRejection')?.[1] as Function;
      expect(rejectionHandler).toBeDefined();

      const reason = new Error('Unhandled rejection');
      const promise = Promise.reject(reason);

      // Catch the rejection to prevent it from being actually unhandled
      promise.catch(() => {});

      rejectionHandler(reason, promise);

      expect(consoleSpy.error).toHaveBeenCalledWith('Unhandled Rejection at:', promise, 'reason:', reason);
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle uncaught exception', async () => {
      await import('./main');

      // Get the uncaughtException handler
      const exceptionHandler = processOnSpy.mock.calls.find(call => call[0] === 'uncaughtException')?.[1] as Function;
      expect(exceptionHandler).toBeDefined();

      const error = new Error('Uncaught exception');
      exceptionHandler(error);

      expect(consoleSpy.error).toHaveBeenCalledWith('Uncaught Exception:', error);
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });
});
