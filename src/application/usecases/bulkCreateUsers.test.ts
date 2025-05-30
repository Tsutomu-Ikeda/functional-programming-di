import * as E from 'fp-ts/lib/Either';
import { bulkCreateUsers } from './bulkCreateUsers';
import { CreateUserInput } from '../../domain/userValidation';
import { User } from '../../domain/user';

const mockUserRepository = {
  findById: jest.fn(),
  findByEmail: jest.fn(),
  save: jest.fn(),
  saveBulk: jest.fn()
};

const mockEmailService = {
  sendWelcomeEmail: jest.fn()
};

const mockLogger = {
  info: jest.fn().mockReturnValue(() => {}),
  error: jest.fn().mockReturnValue(() => {})
};

const deps = {
  userRepository: mockUserRepository,
  emailService: mockEmailService,
  logger: mockLogger
};

describe('bulkCreateUsers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create multiple users successfully', async () => {
    mockUserRepository.findByEmail.mockImplementation((email) => {
      return () => Promise.resolve(E.left({ _tag: 'UserNotFound', userId: email }));
    });

    mockUserRepository.saveBulk.mockImplementation((users) => {
      return () => Promise.resolve(E.right(users));
    });

    mockEmailService.sendWelcomeEmail.mockImplementation(() => {
      return () => Promise.resolve(E.right(undefined));
    });

    const inputs: CreateUserInput[] = [
      { email: 'user1@example.com', name: 'User One', password: 'password123' },
      { email: 'user2@example.com', name: 'User Two', password: 'password456' }
    ];

    const result = await bulkCreateUsers(inputs)(deps)();

    expect(E.isRight(result)).toBe(true);
    if (E.isRight(result)) {
      expect(result.right.successful.length).toBe(2);
      expect(result.right.failed.length).toBe(0);
      expect(mockUserRepository.saveBulk).toHaveBeenCalledTimes(1);
      expect(mockEmailService.sendWelcomeEmail).toHaveBeenCalledTimes(2);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Successfully created 2 users'),
        expect.any(Object)
      );
    }
  });

  it('should handle validation errors', async () => {
    const inputs: CreateUserInput[] = [
      { email: 'invalid-email', name: 'User One', password: 'password123' },
      { email: 'user2@example.com', name: 'U', password: 'pass' }
    ];

    const result = await bulkCreateUsers(inputs)(deps)();

    expect(E.isLeft(result)).toBe(true);
    if (E.isLeft(result)) {
      expect(result.left._tag).toBe('BulkValidationError');
      if (result.left._tag === 'BulkValidationError') {
        expect(result.left.failedInputs.length).toBe(2);
      }
    }
  });

  it('should handle database errors', async () => {
    mockUserRepository.findByEmail.mockImplementation((email) => {
      return () => Promise.resolve(E.left({ _tag: 'UserNotFound', userId: email }));
    });

    mockUserRepository.saveBulk.mockImplementation(() => {
      return () => Promise.resolve(E.left({ 
        _tag: 'DatabaseError', 
        message: 'Database connection failed' 
      }));
    });

    const inputs: CreateUserInput[] = [
      { email: 'user1@example.com', name: 'User One', password: 'password123' },
      { email: 'user2@example.com', name: 'User Two', password: 'password456' }
    ];

    const result = await bulkCreateUsers(inputs)(deps)();

    expect(E.isLeft(result)).toBe(true);
    if (E.isLeft(result)) {
      expect(result.left._tag).toBe('DatabaseError');
    }
  });

  it('should handle empty input array', async () => {
    const inputs: CreateUserInput[] = [];

    const result = await bulkCreateUsers(inputs)(deps)();

    expect(E.isLeft(result)).toBe(true);
    if (E.isLeft(result)) {
      expect(result.left._tag).toBe('ValidationError');
    }
  });
});
