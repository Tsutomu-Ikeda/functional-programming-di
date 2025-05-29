import * as E from 'fp-ts/lib/Either';
import { resolvers, GraphQLContext } from './resolvers';
import { User } from '../../domain/user';
import { ScopedContainer, RequestContext } from '../../infrastructure/di/types';
import { UserRepository, EmailService } from '../../application/ports';

// Mock dependencies
jest.mock('../../application/usecases/createUser');
jest.mock('../../infrastructure/logging/logger');

describe('GraphQL Resolvers', () => {
  let mockContainer: jest.Mocked<ScopedContainer>;
  let mockUserRepository: jest.Mocked<UserRepository>;
  let mockEmailService: jest.Mocked<EmailService>;
  let context: GraphQLContext;

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
  });

  describe('Query.getUser', () => {
    const testUser: User = {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
      role: 'user'
    };

    it('should return user successfully', async () => {
      mockUserRepository.findById.mockReturnValue(
        jest.fn().mockResolvedValue(E.right(testUser))
      );

      const result = await resolvers.Query.getUser(
        {},
        { id: 'user-123' },
        context
      );

      expect(result).toEqual({
        success: true,
        data: {
          ...testUser,
          role: 'USER'
        },
        error: null
      });
      expect(mockUserRepository.findById).toHaveBeenCalledWith('user-123');
    });

    it('should handle user not found error', async () => {
      mockUserRepository.findById.mockReturnValue(
        jest.fn().mockResolvedValue(E.left({
          _tag: 'UserNotFound',
          userId: 'user-123'
        }))
      );

      const result = await resolvers.Query.getUser(
        {},
        { id: 'user-123' },
        context
      );

      expect(result).toEqual({
        success: false,
        data: null,
        error: 'User not found: user-123'
      });
    });

    it('should handle database error', async () => {
      mockUserRepository.findById.mockReturnValue(
        jest.fn().mockResolvedValue(E.left({
          _tag: 'DatabaseError',
          message: 'Connection failed'
        }))
      );

      const result = await resolvers.Query.getUser(
        {},
        { id: 'user-123' },
        context
      );

      expect(result).toEqual({
        success: false,
        data: null,
        error: 'Internal server error'
      });
    });

    it('should handle unexpected errors', async () => {
      mockContainer.resolve.mockRejectedValue(new Error('Container error'));

      const result = await resolvers.Query.getUser(
        {},
        { id: 'user-123' },
        context
      );

      expect(result).toEqual({
        success: false,
        data: null,
        error: 'Unexpected error occurred'
      });
    });
  });

  describe('Mutation.createUser', () => {
    const createUserInput = {
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

    beforeEach(() => {
      // Mock the createUser use case
      const { createUser } = require('../../application/usecases/createUser');
      createUser.mockReturnValue(() => jest.fn().mockResolvedValue(E.right(createdUser)));
    });

    it('should create user successfully', async () => {
      const result = await resolvers.Mutation.createUser(
        {},
        { input: createUserInput },
        context
      );

      expect(result).toEqual({
        success: true,
        data: {
          ...createdUser,
          role: 'USER'
        },
        error: null
      });
    });

    it('should handle validation error', async () => {
      const { createUser } = require('../../application/usecases/createUser');
      createUser.mockReturnValue(() => jest.fn().mockResolvedValue(E.left({
        _tag: 'ValidationError',
        errors: [
          { field: 'email', message: 'Invalid email format' },
          { field: 'password', message: 'Password too short' }
        ]
      })));

      const result = await resolvers.Mutation.createUser(
        {},
        { input: createUserInput },
        context
      );

      expect(result).toEqual({
        success: false,
        data: null,
        error: 'Validation failed: Invalid email format, Password too short'
      });
    });

    it('should handle user not found error', async () => {
      const { createUser } = require('../../application/usecases/createUser');
      createUser.mockReturnValue(() => jest.fn().mockResolvedValue(E.left({
        _tag: 'UserNotFound',
        userId: 'user-123'
      })));

      const result = await resolvers.Mutation.createUser(
        {},
        { input: createUserInput },
        context
      );

      expect(result).toEqual({
        success: false,
        data: null,
        error: 'User not found: user-123'
      });
    });

    it('should handle database error', async () => {
      const { createUser } = require('../../application/usecases/createUser');
      createUser.mockReturnValue(() => jest.fn().mockResolvedValue(E.left({
        _tag: 'DatabaseError',
        message: 'Connection timeout'
      })));

      const result = await resolvers.Mutation.createUser(
        {},
        { input: createUserInput },
        context
      );

      expect(result).toEqual({
        success: false,
        data: null,
        error: 'Database error: Connection timeout'
      });
    });

    it('should handle email service error', async () => {
      const { createUser } = require('../../application/usecases/createUser');
      createUser.mockReturnValue(() => jest.fn().mockResolvedValue(E.left({
        _tag: 'EmailServiceError',
        message: 'SMTP server unavailable'
      })));

      const result = await resolvers.Mutation.createUser(
        {},
        { input: createUserInput },
        context
      );

      expect(result).toEqual({
        success: false,
        data: null,
        error: 'Email service error: SMTP server unavailable'
      });
    });

    it('should handle unknown error types', async () => {
      const { createUser } = require('../../application/usecases/createUser');
      createUser.mockReturnValue(() => jest.fn().mockResolvedValue(E.left({
        _tag: 'UnknownError',
        message: 'Something went wrong'
      })));

      const result = await resolvers.Mutation.createUser(
        {},
        { input: createUserInput },
        context
      );

      expect(result).toEqual({
        success: false,
        data: null,
        error: 'Internal server error'
      });
    });

    it('should handle unexpected errors', async () => {
      mockContainer.resolve.mockRejectedValue(new Error('Container error'));

      const result = await resolvers.Mutation.createUser(
        {},
        { input: createUserInput },
        context
      );

      expect(result).toEqual({
        success: false,
        data: null,
        error: 'Unexpected error occurred'
      });
    });

    it('should resolve dependencies correctly', async () => {
      await resolvers.Mutation.createUser(
        {},
        { input: createUserInput },
        context
      );

      expect(mockContainer.resolve).toHaveBeenCalledWith('userRepository');
      expect(mockContainer.resolve).toHaveBeenCalledWith('emailService');
    });
  });

  describe('GraphQLContext interface', () => {
    it('should have correct structure', () => {
      expect(context).toHaveProperty('container');
      expect(context).toHaveProperty('requestContext');
      expect(context.requestContext).toHaveProperty('requestId');
      expect(context.requestContext).toHaveProperty('startTime');
      expect(context.requestContext).toHaveProperty('metadata');
    });
  });
});
