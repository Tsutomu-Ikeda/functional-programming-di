import { TRPCError } from '@trpc/server';
import * as E from 'fp-ts/lib/Either';
import { ScopedContainer, RequestContext } from '../../infrastructure/di/types';
import { UserRepository, EmailService } from '../../application/ports';
import { User } from '../../domain/user';

// Mock the createUser use case
const mockCreateUser = jest.fn();
jest.mock('../../application/usecases/createUser', () => ({
  createUser: mockCreateUser
}));

// Mock the logger
jest.mock('../../infrastructure/logging/logger', () => ({
  RequestScopedLogger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }))
}));

// Import after mocking
import { appRouter, TRPCContext } from './router';

describe('TRPC Router', () => {
  let mockContainer: jest.Mocked<ScopedContainer>;
  let mockUserRepository: jest.Mocked<UserRepository>;
  let mockEmailService: jest.Mocked<EmailService>;
  let context: TRPCContext;

  beforeEach(() => {
    mockUserRepository = {
      findById: jest.fn(),
      save: jest.fn(),
      findByEmail: jest.fn()
    };

    mockEmailService = {
      sendWelcomeEmail: jest.fn()
    };

    mockContainer = {
      resolve: jest.fn(),
      dispose: jest.fn()
    };

    const requestContext: RequestContext = {
      requestId: 'test-request-123',
      startTime: new Date(),
      metadata: {}
    };

    context = {
      container: mockContainer,
      requestContext
    };

    // Setup default container resolve behavior
    mockContainer.resolve.mockImplementation((key: string) => {
      if (key === 'userRepository') return Promise.resolve(mockUserRepository);
      if (key === 'emailService') return Promise.resolve(mockEmailService);
      throw new Error(`Unknown service: ${key}`);
    });

    // Reset mocks
    mockCreateUser.mockClear();
  });

  describe('user.create', () => {
    const validInput = {
      email: 'test@example.com',
      name: 'Test User',
      password: 'password123'
    };

    const createdUser: User = {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
      role: 'user'
    };

    it('should create user successfully', async () => {
      // Mock the createUser use case to return a ReaderTaskEither that resolves to Right
      mockCreateUser.mockReturnValue(() => () => Promise.resolve(E.right(createdUser)));

      const caller = appRouter.createCaller(context);
      const result = await caller.user.create(validInput);

      expect(result).toEqual({
        success: true,
        data: createdUser
      });
    });

    it('should validate input schema', async () => {
      const caller = appRouter.createCaller(context);

      // Test invalid email
      await expect(caller.user.create({
        email: 'invalid-email',
        name: 'Test User',
        password: 'password123'
      })).rejects.toThrow();

      // Test short name
      await expect(caller.user.create({
        email: 'test@example.com',
        name: 'T',
        password: 'password123'
      })).rejects.toThrow();

      // Test short password
      await expect(caller.user.create({
        email: 'test@example.com',
        name: 'Test User',
        password: '123'
      })).rejects.toThrow();
    });

    it('should handle validation errors from use case', async () => {
      mockCreateUser.mockReturnValue(() => () => Promise.resolve(E.left({
        _tag: 'ValidationError',
        errors: [
          { field: 'email', message: 'Email already exists' }
        ]
      })));

      const caller = appRouter.createCaller(context);

      await expect(caller.user.create(validInput)).rejects.toThrow(TRPCError);
      await expect(caller.user.create(validInput)).rejects.toThrow('Validation failed');
    });

    it('should handle dependency resolution errors', async () => {
      mockContainer.resolve.mockRejectedValue(new Error('Container error'));

      const caller = appRouter.createCaller(context);

      await expect(caller.user.create(validInput)).rejects.toThrow(TRPCError);
      await expect(caller.user.create(validInput)).rejects.toThrow('Failed to resolve dependencies');
    });
  });

  describe('user.getById', () => {
    const testUser: User = {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
      role: 'user'
    };

    it('should get user by ID successfully', async () => {
      mockUserRepository.findById.mockReturnValue(
        () => Promise.resolve(E.right(testUser))
      );

      const caller = appRouter.createCaller(context);
      const result = await caller.user.getById({ id: 'user-123' });

      expect(result).toEqual({
        success: true,
        data: testUser
      });
      expect(mockUserRepository.findById).toHaveBeenCalledWith('user-123');
    });

    it('should validate input schema', async () => {
      const caller = appRouter.createCaller(context);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(caller.user.getById({} as any)).rejects.toThrow();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(caller.user.getById({ id: 123 } as any)).rejects.toThrow();
    });

    it('should handle user not found', async () => {
      mockUserRepository.findById.mockReturnValue(
        () => Promise.resolve(E.left({
          _tag: 'UserNotFound',
          userId: 'user-123'
        }))
      );

      const caller = appRouter.createCaller(context);

      await expect(caller.user.getById({ id: 'user-123' })).rejects.toThrow(TRPCError);
      await expect(caller.user.getById({ id: 'user-123' })).rejects.toThrow('User not found');
    });

    it('should handle user repository resolution errors', async () => {
      mockContainer.resolve.mockImplementation((key: string) => {
        if (key === 'userRepository') return Promise.reject(new Error('Repository error'));
        return Promise.resolve(mockEmailService);
      });

      const caller = appRouter.createCaller(context);

      await expect(caller.user.getById({ id: 'user-123' })).rejects.toThrow(TRPCError);
      await expect(caller.user.getById({ id: 'user-123' })).rejects.toThrow('Failed to resolve user repository');
    });
  });

  describe('Error mapping', () => {
    it('should map ValidationError to BAD_REQUEST', async () => {
      mockCreateUser.mockReturnValue(() => () => Promise.resolve(E.left({
        _tag: 'ValidationError',
        errors: [{ field: 'email', message: 'Invalid email' }]
      })));

      const caller = appRouter.createCaller(context);

      try {
        await caller.user.create({
          email: 'test@example.com',
          name: 'Test User',
          password: 'password123'
        });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe('BAD_REQUEST');
        expect((error as TRPCError).cause?.message).toEqual("email: Invalid email");
      }
    });

    it('should map UserNotFound to NOT_FOUND', async () => {
      mockUserRepository.findById.mockReturnValue(
        () => Promise.resolve(E.left({
          _tag: 'UserNotFound',
          userId: 'user-123'
        }))
      );

      const caller = appRouter.createCaller(context);

      try {
        await caller.user.getById({ id: 'user-123' });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe('NOT_FOUND');
        expect((error as TRPCError).cause?.message).toEqual("{\"userId\":\"user-123\"}");
      }
    });

    it('should map DatabaseError to INTERNAL_SERVER_ERROR', async () => {
      mockUserRepository.findById.mockReturnValue(
        () => Promise.resolve(E.left({
          _tag: 'DatabaseError',
          message: 'Connection failed'
        }))
      );

      const caller = appRouter.createCaller(context);

      try {
        await caller.user.getById({ id: 'user-123' });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe('INTERNAL_SERVER_ERROR');
        expect((error as TRPCError).cause?.message).toEqual("{\"message\":\"Connection failed\"}");
      }
    });
  });

  describe('TRPCContext interface', () => {
    it('should have correct structure', () => {
      expect(context).toHaveProperty('container');
      expect(context).toHaveProperty('requestContext');
      expect(context.requestContext).toHaveProperty('requestId');
      expect(context.requestContext).toHaveProperty('startTime');
      expect(context.requestContext).toHaveProperty('metadata');
    });
  });

  describe('Router structure', () => {
    it('should have user router with create and getById procedures', () => {
      // Test that we can create a caller and access the procedures
      const caller = appRouter.createCaller(context);
      expect(caller.user).toBeDefined();
      expect(typeof caller.user.create).toBe('function');
      expect(typeof caller.user.getById).toBe('function');
    });

    it('should export AppRouter type', () => {
      // This is a compile-time check, but we can verify the router exists
      expect(appRouter).toBeDefined();
      expect(typeof appRouter.createCaller).toBe('function');
    });
  });
});
