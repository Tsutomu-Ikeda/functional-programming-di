import * as TE from 'fp-ts/TaskEither';
import * as E from 'fp-ts/Either';
import * as IO from 'fp-ts/IO';
import {
  createUser,
  UserRepository,
  EmailService,
  Logger,
  User,
  DomainError,
  CreateUserInput,
  CreateUserDeps,
} from './index';

describe('Integration Tests', () => {
  let mockUserRepository: jest.Mocked<UserRepository>;
  let mockEmailService: jest.Mocked<EmailService>;
  let mockLogger: jest.Mocked<Logger>;
  let deps: CreateUserDeps;

  beforeEach(() => {
    mockUserRepository = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      save: jest.fn(),
    };

    mockEmailService = {
      sendWelcomeEmail: jest.fn(),
    };

    mockLogger = {
      info: jest.fn().mockReturnValue(IO.of(undefined)),
      error: jest.fn().mockReturnValue(IO.of(undefined)),
    };

    deps = {
      userRepository: mockUserRepository,
      emailService: mockEmailService,
      logger: mockLogger,
    };

    jest.clearAllMocks();
  });

  describe('End-to-End User Creation Flow', () => {
    it('should complete full user creation workflow successfully', async () => {
      const input: CreateUserInput = {
        email: 'integration@example.com',
        name: 'Integration Test User',
        password: 'securePassword123',
      };

      const createdUser: User = {
        id: 'integration-user-id',
        email: input.email,
        name: input.name,
        role: 'user',
      };

      // Setup mocks for successful flow
      mockUserRepository.findByEmail.mockReturnValue(
        TE.left({ _tag: 'UserNotFound', userId: input.email }),
      );
      mockUserRepository.save.mockReturnValue(TE.right(createdUser));
      mockEmailService.sendWelcomeEmail.mockReturnValue(TE.right(undefined));

      // Execute the complete workflow
      const result = await createUser(input)(deps)();

      // Verify successful result
      expect(result).toEqual(E.right(createdUser));

      // Verify all steps were executed in correct order
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(input.email);
      expect(mockUserRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          email: input.email,
          name: input.name,
          role: 'user',
          id: expect.any(String),
        }),
      );
      expect(mockEmailService.sendWelcomeEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          email: input.email,
          name: input.name,
          role: 'user',
          id: expect.any(String),
        }),
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Creating user',
        expect.objectContaining({ userId: expect.any(String) }),
      );

      // Verify call order
      const findEmailCall = mockUserRepository.findByEmail.mock.invocationCallOrder[0];
      const saveCall = mockUserRepository.save.mock.invocationCallOrder[0];
      const emailCall = mockEmailService.sendWelcomeEmail.mock.invocationCallOrder[0];
      const logCall = mockLogger.info.mock.invocationCallOrder[0];

      expect(findEmailCall).toBeLessThan(saveCall);
      expect(saveCall).toBeLessThan(emailCall);
      expect(logCall).toBeLessThan(emailCall);
    });

    it('should handle partial failure gracefully (email service fails)', async () => {
      const input: CreateUserInput = {
        email: 'partial-fail@example.com',
        name: 'Partial Fail User',
        password: 'password123',
      };

      const createdUser: User = {
        id: 'partial-fail-user-id',
        email: input.email,
        name: input.name,
        role: 'user',
      };

      // Setup mocks - email service fails but user creation succeeds
      mockUserRepository.findByEmail.mockReturnValue(
        TE.left({ _tag: 'UserNotFound', userId: input.email }),
      );
      mockUserRepository.save.mockReturnValue(TE.right(createdUser));
      mockEmailService.sendWelcomeEmail.mockReturnValue(
        TE.left({ _tag: 'Unauthorized', reason: 'Email service temporarily unavailable' }),
      );

      const result = await createUser(input)(deps)();

      // User should still be created successfully
      expect(E.isLeft(result)).toBe(true);

      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to send welcome email',
        expect.any(Error),
        { userId: createdUser.id },
      );

      // Verify user was still saved despite email failure
      expect(mockUserRepository.save).toHaveBeenCalled();
    });

    it('should fail fast on validation errors without calling external services', async () => {
      const invalidInput: CreateUserInput = {
        email: 'invalid-email-format',
        name: 'A', // Too short
        password: '123', // Too short
      };

      const result = await createUser(invalidInput)(deps)();

      expect(result).toEqual(
        E.left(
          expect.objectContaining({
            _tag: 'ValidationError',
            errors: expect.arrayContaining([
              { field: 'email', message: 'Invalid email format' },
              { field: 'name', message: 'Name must be at least 2 characters' },
              { field: 'password', message: 'Password must be at least 6 characters' },
            ]),
          }),
        ),
      );

      // No external services should be called
      expect(mockUserRepository.findByEmail).not.toHaveBeenCalled();
      expect(mockUserRepository.save).not.toHaveBeenCalled();
      expect(mockEmailService.sendWelcomeEmail).not.toHaveBeenCalled();
      expect(mockLogger.info).not.toHaveBeenCalled();
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should handle database errors appropriately', async () => {
      const input: CreateUserInput = {
        email: 'db-error@example.com',
        name: 'DB Error User',
        password: 'password123',
      };

      const dbError: DomainError = {
        _tag: 'Unauthorized',
        reason: 'Database connection timeout',
      };

      // Database fails during email check
      mockUserRepository.findByEmail.mockReturnValue(TE.left(dbError));

      const result = await createUser(input)(deps)();

      expect(result).toEqual(E.left(dbError));

      // Should not proceed to save or email
      expect(mockUserRepository.save).not.toHaveBeenCalled();
      expect(mockEmailService.sendWelcomeEmail).not.toHaveBeenCalled();
    });
  });

  describe('Error Recovery Scenarios', () => {
    it('should handle concurrent user creation attempts', async () => {
      const input: CreateUserInput = {
        email: 'concurrent@example.com',
        name: 'Concurrent User',
        password: 'password123',
      };

      // First call succeeds, second call finds existing user
      mockUserRepository.findByEmail
        .mockReturnValueOnce(TE.left({ _tag: 'UserNotFound', userId: input.email }))
        .mockReturnValueOnce(TE.right({
          id: 'existing-id',
          email: input.email,
          name: 'Existing User',
          role: 'user',
        }));

      mockUserRepository.save.mockReturnValue(TE.right({
        id: 'new-id',
        email: input.email,
        name: input.name,
        role: 'user',
      }));

      mockEmailService.sendWelcomeEmail.mockReturnValue(TE.right(undefined));

      // First creation should succeed
      const result1 = await createUser(input)(deps)();
      expect(E.isRight(result1)).toBe(true);

      // Second creation should fail with validation error
      const result2 = await createUser(input)(deps)();
      expect(result2).toEqual(E.left(expect.objectContaining({
        _tag: 'ValidationError',
        errors: expect.arrayContaining([{
          field: 'email',
          message: 'Email already exists',
        }]),
      })));
    });
  });
});
