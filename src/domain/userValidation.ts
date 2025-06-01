import * as E from 'fp-ts/lib/Either';
import { pipe } from 'fp-ts/lib/function';
import { combineValidations } from '../shared/validation';
import type { DomainError, ValidationError } from './errors';

export interface CreateUserInput {
  email: string;
  name: string;
  password: string;
}

export function validateCreateUserInput(input: CreateUserInput): E.Either<DomainError, CreateUserInput> {
  return pipe(
    combineValidations<CreateUserInput>(validateEmail, validateName, validatePassword)(input),
    E.mapLeft((errors) => ({ _tag: 'ValidationError', errors })),
  );
}

const validateEmail = (input: CreateUserInput): E.Either<ValidationError[], CreateUserInput> => {
  const isValid = Boolean(input.email && input.email.includes('@'));
  return isValid ? E.right(input) : E.left([{ field: 'email', message: 'Invalid email format' }]);
};

const validateName = (input: CreateUserInput): E.Either<ValidationError[], CreateUserInput> => {
  const isValid = Boolean(input.name && input.name.length >= 2);
  return isValid ? E.right(input) : E.left([{ field: 'name', message: 'Name must be at least 2 characters' }]);
};

const validatePassword = (input: CreateUserInput): E.Either<ValidationError[], CreateUserInput> => {
  const isValid = Boolean(input.password && input.password.length >= 6);
  return isValid
    ? E.right(input)
    : E.left([
        {
          field: 'password',
          message: 'Password must be at least 6 characters',
        },
      ]);
};
