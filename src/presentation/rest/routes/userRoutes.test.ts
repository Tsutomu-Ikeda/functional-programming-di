import { Response } from 'express';
import * as TE from 'fp-ts/lib/TaskEither';
import * as E from 'fp-ts/lib/Either';
import * as IO from 'fp-ts/lib/IO';
import {
  createUserRoutes,
  createUserRoutesFP,
  createRouteConfig,
  AuthenticatedRequest
} from './userRoutes';
import { ScopedContainer, RequestContext } from '../../../infrastructure/di/types';
import { UserRepository, EmailService } from '../../../application/ports';
import { RequestScopedLogger } from '../../../infrastructure/logging/logger';
import { CreateUserInput } from '../../../domain/userValidation';
import { User } from '../../../domain/user';
import { DomainError } from '../../../domain/errors';
import { SQLiteConnectionPool } from '../../../infrastructure/database/sqliteConnection';
import { DatabaseUserRepository } from '../../../infrastructure/repositories/userRepository';
import { depend } from '../../../infrastructure/di/types';
import path from 'path';
import fs from 'fs';

// Test database setup
const TEST_DB_PATH = path.join(__dirname, '../../../test.db');

// Mock implementations
class MockEmailService implements EmailService {
  sendWelcomeEmail = jest.fn().mockReturnValue(TE.right(undefined));
}

class MockLogger extends RequestScopedLogger {
  constructor() {
    super(
      { requestId: 'test-request', startTime: new Date(), metadata: {} },
      { level: 'info', format: 'json' }
    );
  }

  info = jest.fn().mockReturnValue(IO.of(undefined));
  error = jest.fn().mockReturnValue(IO.of(undefined));
  warn = jest.fn().mockReturnValue(IO.of(undefined));
  debug = jest.fn().mockReturnValue(IO.of(undefined));
}

// Test container implementation
class TestScopedContainer implements ScopedContainer {
  private services = new Map<string, unknown>();

  constructor(
    private userRepository: UserRepository,
    private emailService: EmailService
  ) {
    this.services.set('userRepository', userRepository);
    this.services.set('emailService', emailService);
  }

  async resolve<T>(key: string): Promise<T> {
    const service = this.services.get(key);
    if (!service) {
      throw new Error(`Service ${key} not found`);
    }
    return service as T;
  }

  async dispose(): Promise<void> {
    // Cleanup if needed
  }
}

// Helper to create mock request
const createMockRequest = (
  body: unknown = {},
  params: Record<string, string> = {},
  container: ScopedContainer,
  context: RequestContext
): AuthenticatedRequest => ({
  body,
  params,
  container,
  context,
  // Express Request properties (minimal mock)
  get: jest.fn(),
  header: jest.fn(),
  accepts: jest.fn(),
  acceptsCharsets: jest.fn(),
  acceptsEncodings: jest.fn(),
  acceptsLanguages: jest.fn(),
  range: jest.fn(),
  param: jest.fn(),
  is: jest.fn(),
  protocol: 'http',
  secure: false,
  ip: '127.0.0.1',
  ips: [],
  subdomains: [],
  path: '/users',
  hostname: 'localhost',
  host: 'localhost',
  fresh: false,
  stale: true,
  xhr: false,
  route: undefined,
  signedCookies: {},
  originalUrl: '/users',
  url: '/users',
  baseUrl: '',
  cookies: {},
  method: 'POST',
  query: {},
  res: undefined,
  socket: undefined,
  httpVersion: '1.1',
  httpVersionMajor: 1,
  httpVersionMinor: 1,
  complete: true,
  connection: undefined,
  headers: {},
  rawHeaders: [],
  trailers: {},
  rawTrailers: [],
  setTimeout: jest.fn(),
  statusCode: undefined,
  statusMessage: undefined,
  destroy: jest.fn(),
  readable: true,
  readableEncoding: null,
  readableEnded: false,
  readableFlowing: null,
  readableHighWaterMark: 16384,
  readableLength: 0,
  readableObjectMode: false,
  destroyed: false,
  _read: jest.fn(),
  read: jest.fn(),
  setEncoding: jest.fn(),
  pause: jest.fn(),
  resume: jest.fn(),
  isPaused: jest.fn(),
  unpipe: jest.fn(),
  unshift: jest.fn(),
  wrap: jest.fn(),
  push: jest.fn(),
  _destroy: jest.fn(),
  addListener: jest.fn(),
  emit: jest.fn(),
  on: jest.fn(),
  once: jest.fn(),
  prependListener: jest.fn(),
  prependOnceListener: jest.fn(),
  removeListener: jest.fn(),
  off: jest.fn(),
  removeAllListeners: jest.fn(),
  setMaxListeners: jest.fn(),
  getMaxListeners: jest.fn(),
  listeners: jest.fn(),
  rawListeners: jest.fn(),
  listenerCount: jest.fn(),
  eventNames: jest.fn(),
  pipe: jest.fn()
} as unknown as AuthenticatedRequest);

// Helper to create mock response
const createMockResponse = (): Response => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
    locals: {}
  } as unknown as Response;
  return res;
};

describe('userRoutes', () => {
  let sqlitePool: SQLiteConnectionPool;
  let userRepository: UserRepository;
  let emailService: MockEmailService;
  let logger: MockLogger;
  let container: TestScopedContainer;
  let context: RequestContext;

  beforeAll(async () => {
    // Remove test database if it exists
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    // Initialize SQLite database
    sqlitePool = new SQLiteConnectionPool({
      filename: TEST_DB_PATH
    });
    await sqlitePool.initialize();
  });
  afterAll(async () => {
    // Cleanup
    await sqlitePool.close();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  beforeEach(async () => {
    // Clear database
    const connection = sqlitePool.getConnection();
    await connection.query('DELETE FROM users')();

    // Setup dependencies
    userRepository = new DatabaseUserRepository(connection);
    emailService = new MockEmailService();
    logger = new MockLogger();
    container = new TestScopedContainer(userRepository, emailService);

    context = {
      requestId: 'test-request-id',
      startTime: new Date(),
      metadata: {}
    };

    jest.clearAllMocks();
  });

  describe('createUserHandler', () => {
    it('should create a user successfully', async () => {
      const input: CreateUserInput = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123'
      };

      const req = createMockRequest(input, {}, container, context);
      const res = createMockResponse();
      const next = jest.fn();

      // Get the router and extract the handler
      const router = createUserRoutes();
      const createUserRoute = router.stack.find((layer) => layer.route?.path === '/users' && layer.route?.post);
      const createUserHandler = createUserRoute?.route?.stack?.[0]?.handle;

      expect(createUserHandler).toBeDefined();

      await createUserHandler!(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          email: input.email,
          name: input.name,
          role: 'user',
          id: expect.any(String)
        })
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle validation errors', async () => {
      const input: CreateUserInput = {
        email: 'invalid-email',
        name: 'T',
        password: '123'
      };

      const req = createMockRequest(input, {}, container, context);
      const res = createMockResponse();
      const next = jest.fn();

      const router = createUserRoutes();
      const createUserRoute = router.stack.find((layer) => layer.route?.path === '/users' && layer.route?.post);
      const createUserHandler = createUserRoute?.route?.stack?.[0]?.handle;

      await createUserHandler!(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Validation failed',
        details: expect.arrayContaining([
          expect.objectContaining({
            field: 'email',
            message: 'Invalid email format'
          }),
          expect.objectContaining({
            field: 'name',
            message: 'Name must be at least 2 characters'
          }),
          expect.objectContaining({
            field: 'password',
            message: 'Password must be at least 6 characters'
          })
        ])
      });
    });

    it('should handle duplicate email error', async () => {
      const input: CreateUserInput = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123'
      };

      // First, create a user
      const connection = sqlitePool.getConnection();
      const existingUser: User = {
        id: 'existing-id',
        email: input.email,
        name: 'Existing User',
        role: 'user'
      };
      await connection.query(
        'INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)',
        [existingUser.id, existingUser.email, existingUser.name, existingUser.role]
      )();

      const req = createMockRequest(input, {}, container, context);
      const res = createMockResponse();
      const next = jest.fn();

      const router = createUserRoutes();
      const createUserRoute = router.stack.find((layer) => layer.route?.path === '/users' && layer.route?.post);
      const createUserHandler = createUserRoute?.route?.stack?.[0]?.handle;

      await createUserHandler!(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Validation failed',
        details: expect.arrayContaining([
          expect.objectContaining({
            field: 'email',
            message: 'Email already exists'
          })
        ])
      });
    });

    it('should handle email service errors gracefully', async () => {
      const input: CreateUserInput = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123'
      };

      // Mock email service to fail
      emailService.sendWelcomeEmail.mockReturnValue(
        TE.left({ _tag: 'EmailServiceError', message: 'Service unavailable' })
      );

      const req = createMockRequest(input, {}, container, context);
      const res = createMockResponse();
      const next = jest.fn();

      const router = createUserRoutes();
      const createUserRoute = router.stack.find((layer) => layer.route?.path === '/users' && layer.route?.post);
      const createUserHandler = createUserRoute?.route?.stack?.[0]?.handle;

      await createUserHandler!(req, res, next);

      // User should still be created successfully even if email fails
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Email service error',
        details: { message: 'Service unavailable' }
      });
    });

    it('should handle dependency resolution errors', async () => {
      const input: CreateUserInput = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123'
      };

      // Create a container that fails to resolve dependencies
      const failingContainer: ScopedContainer = {
        resolve: jest.fn().mockRejectedValue(new Error('Service not found')),
        dispose: jest.fn()
      };

      const req = createMockRequest(input, {}, failingContainer, context);
      const res = createMockResponse();
      const next = jest.fn();

      const router = createUserRoutes();
      const createUserRoute = router.stack.find((layer) => layer.route?.path === '/users' && layer.route?.post);
      const createUserHandler = createUserRoute?.route?.stack?.[0]?.handle;

      await createUserHandler!(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Service unavailable',
        details: { message: 'Service not found' }
      });
    });

    it('should handle malformed request body', async () => {
      const input = 'invalid json'; // This will cause validation to fail

      const req = createMockRequest(input, {}, container, context);
      const res = createMockResponse();
      const next = jest.fn();

      const router = createUserRoutes();
      const createUserRoute = router.stack.find((layer) => layer.route?.path === '/users' && layer.route?.post);
      const createUserHandler = createUserRoute?.route?.stack?.[0]?.handle;

      await createUserHandler!(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Validation failed'
        })
      );
    });
  });

  describe('getUserHandler', () => {
    it('should get a user successfully', async () => {
      // First, create a user
      const user: User = {
        id: 'test-user-id',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user'
      };

      const connection = sqlitePool.getConnection();
      await connection.query(
        'INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)',
        [user.id, user.email, user.name, user.role]
      )();

      const req = createMockRequest({}, { id: user.id }, container, context);
      const res = createMockResponse();
      const next = jest.fn();

      const router = createUserRoutes();
      const getUserRoute = router.stack.find((layer) => layer.route?.path === '/users/:id' && layer.route?.get);
      const getUserHandler = getUserRoute?.route?.stack?.[0]?.handle;

      expect(getUserHandler).toBeDefined();

      await getUserHandler!(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        })
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle user not found', async () => {
      const req = createMockRequest({}, { id: 'non-existent-id' }, container, context);
      const res = createMockResponse();
      const next = jest.fn();

      const router = createUserRoutes();
      const getUserRoute = router.stack.find((layer) => layer.route?.path === '/users/:id' && layer.route?.get);
      const getUserHandler = getUserRoute?.route?.stack?.[0]?.handle;

      await getUserHandler!(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'User not found',
        details: { userId: 'non-existent-id' }
      });
    });

    it('should handle dependency resolution errors', async () => {
      const failingContainer: ScopedContainer = {
        resolve: jest.fn().mockRejectedValue(new Error('Service not found')),
        dispose: jest.fn()
      };

      const req = createMockRequest({}, { id: 'test-id' }, failingContainer, context);
      const res = createMockResponse();
      const next = jest.fn();

      const router = createUserRoutes();
      const getUserRoute = router.stack.find((layer) => layer.route?.path === '/users/:id' && layer.route?.get);
      const getUserHandler = getUserRoute?.route?.stack?.[0]?.handle;

      await getUserHandler!(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Service unavailable',
        details: { message: 'Service not found' }
      });
    });
  });

  describe('createUserRoutesFP', () => {
    it('should create router using functional approach', () => {
      const routerIO = createUserRoutesFP();
      const router = routerIO();

      expect(router).toBeDefined();
      expect(typeof router.post).toBe('function');
      expect(typeof router.get).toBe('function');
    });
  });

  describe('createRouteConfig', () => {
    it('should create route configuration', () => {
      const config = createRouteConfig();

      expect(config.routes).toHaveLength(2);
      expect(config.routes[0]).toEqual({
        method: 'POST',
        path: '/users',
        handler: expect.any(Function)
      });
      expect(config.routes[1]).toEqual({
        method: 'GET',
        path: '/users/:id',
        handler: expect.any(Function)
      });
      expect(config.router).toBeDefined();
      expect(config.routerFP).toBeDefined();
    });
  });

  describe('error response creation', () => {
    it('should handle various error types correctly', async () => {
      const testCases = [
        {
          error: { _tag: 'ValidationError', errors: [{ field: 'email', message: 'Invalid' }] } as DomainError,
          expectedStatus: 400,
          expectedError: 'Validation failed'
        },
        {
          error: { _tag: 'UserNotFound', userId: 'test-id' } as DomainError,
          expectedStatus: 404,
          expectedError: 'User not found'
        },
        {
          error: { _tag: 'DatabaseError', message: 'Connection failed' } as DomainError,
          expectedStatus: 500,
          expectedError: 'Database error'
        },
        {
          error: { _tag: 'EmailServiceError', message: 'Service down' } as DomainError,
          expectedStatus: 500,
          expectedError: 'Email service error'
        },
        {
          error: { _tag: 'InvalidEmail', email: 'bad@email' } as DomainError,
          expectedStatus: 400,
          expectedError: 'Validation failed'
        },
        {
          error: { _tag: 'Unauthorized', reason: 'Invalid token' } as DomainError,
          expectedStatus: 401,
          expectedError: 'Unauthorized'
        }
      ];

      for (const testCase of testCases) {
        // Create a mock container that returns the specific error
        const errorContainer: ScopedContainer = {
          resolve: jest.fn().mockImplementation((key: string) => {
            if (key === 'userRepository') {
              return Promise.resolve({
                findById: () => TE.left(testCase.error),
                findByEmail: () => TE.left(testCase.error),
                save: () => TE.left(testCase.error)
              });
            }
            return Promise.resolve(emailService);
          }),
          dispose: jest.fn()
        };

        const req = createMockRequest({ id: 'test-id' }, { id: 'test-id' }, errorContainer, context);
        const res = createMockResponse();
        const next = jest.fn();

        const router = createUserRoutes();
        const getUserHandler = router.stack
          .find((layer) => layer.route?.path === '/users/:id' && layer.route?.get)
          ?.route?.stack?.[0]?.handle;

        await getUserHandler!(req, res, next);

        expect(res.status).toHaveBeenCalledWith(testCase.expectedStatus);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: testCase.expectedError
          })
        );
      }
    });
  });

  describe('SQLite integration', () => {
    it('should persist and retrieve users correctly', async () => {
      const user: User = {
        id: 'sqlite-test-id',
        email: 'sqlite@example.com',
        name: 'SQLite Test User',
        role: 'admin'
      };

      // Save user
      const saveResult = await userRepository.save(user)();
      expect(E.isRight(saveResult)).toBe(true);

      // Retrieve by ID
      const findByIdResult = await userRepository.findById(user.id)();
      expect(findByIdResult).toEqual(E.right(expect.objectContaining(user)));

      // Retrieve by email
      const findByEmailResult = await userRepository.findByEmail(user.email)();
      expect(findByEmailResult).toEqual(E.right(expect.objectContaining(user)));
    });

    it('should handle database constraints', async () => {
      const user1: User = {
        id: 'user1',
        email: 'duplicate@example.com',
        name: 'User 1',
        role: 'user'
      };

      const user2: User = {
        id: 'user2',
        email: 'duplicate@example.com', // Same email
        name: 'User 2',
        role: 'user'
      };

      // Save first user
      const saveResult1 = await userRepository.save(user1)();
      expect(E.isRight(saveResult1)).toBe(true);

      // Try to save second user with same email
      const saveResult2 = await userRepository.save(user2)();
      expect(E.isLeft(saveResult2)).toBe(true);
      expect(saveResult2).toEqual(
        E.left(expect.objectContaining({ _tag: 'DatabaseError' }))
      );
    });
  });

  describe('dependency injection with container.inject', () => {
    it('should work with injected dependencies', async () => {
      // Create a function that uses dependency injection
      const createUserWithDI = depend(
        {
          userRepository,
          emailService,
          logger
        },
        async (deps: { userRepository: UserRepository; emailService: EmailService; logger: RequestScopedLogger }, input: CreateUserInput) => {
          // This simulates how the actual route handler would work
          const result = await deps.userRepository.findByEmail(input.email)();
          if (E.isRight(result)) {
            return E.left({ _tag: 'ValidationError', errors: [{ field: 'email', message: 'Email already exists' }] } as DomainError);
          }

          const newUser: User = {
            id: 'injected-id',
            email: input.email,
            name: input.name,
            role: 'user'
          };

          return deps.userRepository.save(newUser)();
        }
      );

      const input: CreateUserInput = {
        email: 'di-test@example.com',
        name: 'DI Test User',
        password: 'password123'
      };

      const result = await createUserWithDI(input);
      expect(result).toEqual(
        E.right(expect.objectContaining({
          email: input.email,
          name: input.name,
        })));
    });

    it('should allow dependency injection override', async () => {
      const mockUserRepo: UserRepository = {
        findById: jest.fn().mockReturnValue(TE.left({ _tag: 'UserNotFound', userId: 'test' })),
        findByEmail: jest.fn().mockReturnValue(TE.left({ _tag: 'UserNotFound', userId: 'test' })),
        save: jest.fn().mockReturnValue(TE.right({ id: 'mocked', email: 'mock@test.com', name: 'Mock', role: 'user' }))
      };

      const createUserWithDI = depend(
        {
          userRepository,
          emailService,
          logger
        },
        async (deps: { userRepository: UserRepository; emailService: EmailService; logger: RequestScopedLogger }, input: CreateUserInput) => {
          const newUser: User = {
            id: 'test-id',
            email: input.email,
            name: input.name,
            role: 'user'
          };

          return deps.userRepository.save(newUser)();
        }
      );

      // Inject mock repository
      const createUserWithMock = createUserWithDI.inject({ userRepository: mockUserRepo });

      const input: CreateUserInput = {
        email: 'mock-test@example.com',
        name: 'Mock Test User',
        password: 'password123'
      };

      const result = await createUserWithMock(input);
      expect(result).toEqual(
        E.right(expect.objectContaining({
          id: 'mocked',
        })));
      expect(mockUserRepo.save).toHaveBeenCalled();
    });
  });
});
