import * as TE from 'fp-ts/TaskEither';
import * as E from 'fp-ts/Either';
import * as IO from 'fp-ts/IO';
import { createUser, CreateUserDeps } from './createUser';
import { UserRepository, EmailService, Logger } from '../ports';
import { User, DomainError, CreateUserInput } from '../../index';

describe('createUser usecase', () => {
  let mockUserRepository: jest.Mocked<UserRepository>;
  let mockEmailService: jest.Mocked<EmailService>;
  let mockLogger: jest.Mocked<Logger>;
  let deps: CreateUserDeps;

  beforeEach(() => {
    mockUserRepository = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      save: jest.fn(),
      saveBulk: jest.fn()
    };

    mockEmailService = {
      sendWelcomeEmail: jest.fn()
    };

    mockLogger = {
      info: jest.fn().mockReturnValue(IO.of(undefined)),
      error: jest.fn().mockReturnValue(IO.of(undefined))
    };

    deps = {
      userRepository: mockUserRepository,
      emailService: mockEmailService,
      logger: mockLogger
    };

    jest.clearAllMocks();
  });

  describe('successful user creation', () => {
    it('should create a user successfully when email does not exist', async () => {
      const input: CreateUserInput = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123'
      };

      const expectedUser: User = {
        id: 'generated-id',
        email: input.email,
        name: input.name,
        role: 'user'
      };

      mockUserRepository.findByEmail.mockReturnValue(
        TE.left({ _tag: 'UserNotFound', userId: input.email })
      );
      mockUserRepository.save.mockReturnValue(TE.right(expectedUser));
      mockEmailService.sendWelcomeEmail.mockReturnValue(TE.right(undefined));

      const result = await createUser(input)(deps)();

      expect(result).toEqual(E.right({
        email: input.email,
        name: input.name,
        role: 'user',
        id: expect.any(String)
      }));

      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(input.email);
      expect(mockUserRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          email: input.email,
          name: input.name,
          role: 'user'
        })
      );
      expect(mockEmailService.sendWelcomeEmail).toHaveBeenCalledWith(expectedUser);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Creating user',
        expect.objectContaining({ userId: expect.any(String) })
      );
    });

    it('should continue even if welcome email fails', async () => {
      const input: CreateUserInput = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123'
      };

      const expectedUser: User = {
        id: 'generated-id',
        email: input.email,
        name: input.name,
        role: 'user'
      };

      mockUserRepository.findByEmail.mockReturnValue(
        TE.left({ _tag: 'UserNotFound', userId: input.email })
      );
      mockUserRepository.save.mockReturnValue(TE.right(expectedUser));
      mockEmailService.sendWelcomeEmail.mockReturnValue(
        TE.left({ _tag: 'Unauthorized', reason: 'Email service unavailable' })
      );

      const result = await createUser(input)(deps)();

      expect(E.isLeft(result)).toBe(true);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to send welcome email',
        expect.any(Error),
        expect.objectContaining({ userId: expectedUser.id })
      );
    });
  });

  describe('validation errors', () => {
    it('should return validation error for invalid email', async () => {
      const input: CreateUserInput = {
        email: 'invalid-email',
        name: 'Test User',
        password: 'password123'
      };

      const result = await createUser(input)(deps)();

      expect(result).toEqual(E.left({
        _tag: 'ValidationError',
        errors: [{ field: 'email', message: 'Invalid email format' }]
      }));

      expect(mockUserRepository.findByEmail).not.toHaveBeenCalled();
      expect(mockUserRepository.save).not.toHaveBeenCalled();
      expect(mockEmailService.sendWelcomeEmail).not.toHaveBeenCalled();
    });

    it('should return validation error for short name', async () => {
      const input: CreateUserInput = {
        email: 'test@example.com',
        name: 'J',
        password: 'password123'
      };

      const result = await createUser(input)(deps)();

      expect(result).toEqual(E.left({
        _tag: 'ValidationError',
        errors: [{ field: 'name', message: 'Name must be at least 2 characters' }]
      }));
    });

    it('should return validation error for short password', async () => {
      const input: CreateUserInput = {
        email: 'test@example.com',
        name: 'Test User',
        password: '123'
      };

      const result = await createUser(input)(deps)();

      expect(result).toEqual(E.left({
        _tag: 'ValidationError',
        errors: [{ field: 'password', message: 'Password must be at least 6 characters' }]
      }));
    });

    it('should accumulate multiple validation errors', async () => {
      const input: CreateUserInput = {
        email: 'invalid',
        name: 'J',
        password: '123'
      };

      const result = await createUser(input)(deps)();

      expect(result).toEqual(E.left({
        _tag: 'ValidationError',
        errors: [
          { field: 'email', message: 'Invalid email format' },
          { field: 'name', message: 'Name must be at least 2 characters' },
          { field: 'password', message: 'Password must be at least 6 characters' }
        ]
      }));
    });
  });

  describe('email already exists', () => {
    it('should return validation error when email already exists', async () => {
      const input: CreateUserInput = {
        email: 'existing@example.com',
        name: 'Test User',
        password: 'password123'
      };

      const existingUser: User = {
        id: 'existing-id',
        email: input.email,
        name: 'Existing User',
        role: 'user'
      };

      mockUserRepository.findByEmail.mockReturnValue(TE.right(existingUser));

      const result = await createUser(input)(deps)();

      expect(result).toEqual(E.left({
        _tag: 'ValidationError',
        errors: [{ field: 'email', message: 'Email already exists' }]
      }));

      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(input.email);
      expect(mockUserRepository.save).not.toHaveBeenCalled();
      expect(mockEmailService.sendWelcomeEmail).not.toHaveBeenCalled();
    });
  });

  describe('repository errors', () => {
    it('should propagate repository errors other than UserNotFound', async () => {
      const input: CreateUserInput = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123'
      };

      const repositoryError: DomainError = {
        _tag: 'Unauthorized',
        reason: 'Database connection failed'
      };

      mockUserRepository.findByEmail.mockReturnValue(TE.left(repositoryError));

      const result = await createUser(input)(deps)();

      expect(result).toEqual(E.left(repositoryError));

      expect(mockUserRepository.save).not.toHaveBeenCalled();
      expect(mockEmailService.sendWelcomeEmail).not.toHaveBeenCalled();
    });

    it('should propagate save errors', async () => {
      const input: CreateUserInput = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123'
      };

      const saveError: DomainError = {
        _tag: 'Unauthorized',
        reason: 'Save operation failed'
      };

      mockUserRepository.findByEmail.mockReturnValue(
        TE.left({ _tag: 'UserNotFound', userId: input.email })
      );
      mockUserRepository.save.mockReturnValue(TE.left(saveError));

      const result = await createUser(input)(deps)();

      expect(result).toEqual(E.left(saveError));

      expect(mockEmailService.sendWelcomeEmail).not.toHaveBeenCalled();
    });
  });

  describe('logging', () => {
    it('should log user creation', async () => {
      const input: CreateUserInput = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123'
      };

      const expectedUser: User = {
        id: 'generated-id',
        email: input.email,
        name: input.name,
        role: 'user'
      };

      mockUserRepository.findByEmail.mockReturnValue(
        TE.left({ _tag: 'UserNotFound', userId: input.email })
      );
      mockUserRepository.save.mockReturnValue(TE.right(expectedUser));
      mockEmailService.sendWelcomeEmail.mockReturnValue(TE.right(undefined));

      await createUser(input)(deps)();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Creating user',
        expect.objectContaining({ userId: expect.any(String) })
      );
    });

    it('should log email sending errors', async () => {
      const input: CreateUserInput = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123'
      };

      const expectedUser: User = {
        id: 'generated-id',
        email: input.email,
        name: input.name,
        role: 'user'
      };

      const emailError: DomainError = {
        _tag: 'Unauthorized',
        reason: 'Email service down'
      };

      mockUserRepository.findByEmail.mockReturnValue(
        TE.left({ _tag: 'UserNotFound', userId: input.email })
      );
      mockUserRepository.save.mockReturnValue(TE.right(expectedUser));
      mockEmailService.sendWelcomeEmail.mockReturnValue(TE.left(emailError));

      await createUser(input)(deps)();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to send welcome email',
        new Error(JSON.stringify(emailError)),
        { userId: expectedUser.id }
      );
    });
  });
});
