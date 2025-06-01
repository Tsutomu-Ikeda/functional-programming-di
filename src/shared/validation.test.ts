import * as E from 'fp-ts/Either';
import { pipe } from 'fp-ts/lib/function';
import type { CreateUserInput } from '../domain/userValidation';
import { validateCreateUserInput } from '../domain/userValidation';
import { combineValidations, minLength, required } from './validation';

describe('validation', () => {
  describe('validateCreateUserInput', () => {
    it('should return Right for valid input', () => {
      const validInput: CreateUserInput = {
        email: 'test@example.com',
        name: 'John Doe',
        password: 'password123',
      };

      const result = validateCreateUserInput(validInput);

      expect(result).toEqual(E.right(validInput));
    });

    it('should return Left for invalid email', () => {
      const invalidInput: CreateUserInput = {
        email: 'invalid-email',
        name: 'John Doe',
        password: 'password123',
      };

      const result = validateCreateUserInput(invalidInput);

      expect(result).toEqual(
        E.left({
          _tag: 'ValidationError',
          errors: [{ field: 'email', message: 'Invalid email format' }],
        }),
      );
    });

    it('should return Left for empty email', () => {
      const invalidInput: CreateUserInput = {
        email: '',
        name: 'John Doe',
        password: 'password123',
      };

      const result = validateCreateUserInput(invalidInput);

      expect(result).toEqual(
        E.left({
          _tag: 'ValidationError',
          errors: [{ field: 'email', message: 'Invalid email format' }],
        }),
      );
    });

    it('should return Left for short name', () => {
      const invalidInput: CreateUserInput = {
        email: 'test@example.com',
        name: 'J',
        password: 'password123',
      };

      const result = validateCreateUserInput(invalidInput);

      expect(result).toEqual(
        E.left({
          _tag: 'ValidationError',
          errors: [{ field: 'name', message: 'Name must be at least 2 characters' }],
        }),
      );
    });

    it('should return Left for empty name', () => {
      const invalidInput: CreateUserInput = {
        email: 'test@example.com',
        name: '',
        password: 'password123',
      };

      const result = validateCreateUserInput(invalidInput);

      expect(result).toEqual(
        E.left({
          _tag: 'ValidationError',
          errors: [{ field: 'name', message: 'Name must be at least 2 characters' }],
        }),
      );
    });

    it('should return Left for short password', () => {
      const invalidInput: CreateUserInput = {
        email: 'test@example.com',
        name: 'John Doe',
        password: '123',
      };

      const result = validateCreateUserInput(invalidInput);

      expect(result).toEqual(
        E.left({
          _tag: 'ValidationError',
          errors: [
            {
              field: 'password',
              message: 'Password must be at least 6 characters',
            },
          ],
        }),
      );
    });

    it('should return Left for empty password', () => {
      const invalidInput: CreateUserInput = {
        email: 'test@example.com',
        name: 'John Doe',
        password: '',
      };

      const result = validateCreateUserInput(invalidInput);

      expect(result).toEqual(
        E.left({
          _tag: 'ValidationError',
          errors: [
            {
              field: 'password',
              message: 'Password must be at least 6 characters',
            },
          ],
        }),
      );
    });

    it('should accumulate multiple validation errors', () => {
      const invalidInput: CreateUserInput = {
        email: 'invalid',
        name: 'J',
        password: '123',
      };

      const result = validateCreateUserInput(invalidInput);

      expect(result).toEqual(
        E.left({
          _tag: 'ValidationError',
          errors: [
            { field: 'email', message: 'Invalid email format' },
            { field: 'name', message: 'Name must be at least 2 characters' },
            {
              field: 'password',
              message: 'Password must be at least 6 characters',
            },
          ],
        }),
      );
    });
  });

  describe('required', () => {
    it('should return Right for non-empty string', () => {
      const result = required('email')('test@example.com');

      expect(result).toEqual(E.right('test@example.com'));
    });

    it('should return Left for empty string', () => {
      const result = required('email')('');

      expect(result).toEqual(
        E.left([
          {
            field: 'email',
            message: 'email is required',
          },
        ]),
      );
    });

    it('should return Left for whitespace-only string', () => {
      const result = required('name')('   ');

      expect(result).toEqual(
        E.left([
          {
            field: 'name',
            message: 'name is required',
          },
        ]),
      );
    });
  });

  describe('minLength', () => {
    it('should return Right for string meeting minimum length', () => {
      const result = minLength('password', 6)('password123');

      expect(result).toEqual(E.right('password123'));
    });

    it('should return Right for string exactly at minimum length', () => {
      const result = minLength('password', 6)('123456');

      expect(result).toEqual(E.right('123456'));
    });

    it('should return Left for string below minimum length', () => {
      const result = minLength('password', 6)('123');

      expect(result).toEqual(
        E.left([
          {
            field: 'password',
            message: 'password must be at least 6 characters',
          },
        ]),
      );
    });
  });

  describe('combineValidations', () => {
    it('should return Right when all validations pass', () => {
      const validateUser = combineValidations<{ email: string; name: string }>(
        (user) =>
          pipe(
            required('email')(user.email),
            E.map(() => user),
          ),
        (user) =>
          pipe(
            minLength('name', 3)(user.name),
            E.map(() => user),
          ),
      );

      const result = validateUser({ email: 'test@example.com', name: 'John' });

      expect(result).toEqual(E.right({ email: 'test@example.com', name: 'John' }));
    });

    it('should return Left when any validation fails', () => {
      const validateUser = combineValidations<{ email: string; name: string }>(
        (user) =>
          pipe(
            required('email')(user.email),
            E.map(() => user),
          ),
        (user) =>
          pipe(
            minLength('name', 3)(user.name),
            E.map(() => user),
          ),
      );

      const result = validateUser({ email: 'test@example.com', name: 'Jo' });

      expect(result).toEqual(
        E.left([
          {
            field: 'name',
            message: 'name must be at least 3 characters',
          },
        ]),
      );
    });

    it('should accumulate errors from multiple failed validations', () => {
      const validateUser = combineValidations<{ email: string; name: string }>(
        (user) =>
          pipe(
            required('email')(user.email),
            E.map(() => user),
          ),
        (user) =>
          pipe(
            minLength('name', 3)(user.name),
            E.map(() => user),
          ),
      );

      const result = validateUser({ email: '', name: 'Jo' });

      expect(result).toEqual(
        E.left([
          { field: 'email', message: 'email is required' },
          { field: 'name', message: 'name must be at least 3 characters' },
        ]),
      );
    });
  });
});
