import * as E from 'fp-ts/lib/Either';
import { pipe } from 'fp-ts/lib/function';
import { ValidationError, DomainError } from './errors';
import { combineValidations } from '../shared/validation';
import { User } from './user';

export interface CreateUserInput {
  email: string
  name: string
  password: string
}

export interface BulkCreateUserInput {
  users: CreateUserInput[]
}

export interface BulkCreateUserResult {
  successful: User[]
  failed: Array<{ input: CreateUserInput; errors: ValidationError[] }>
}

export function validateCreateUserInput(input: CreateUserInput): E.Either<DomainError, CreateUserInput> {
  const validateUser = combineValidations<CreateUserInput>(
    validateEmail,
    validateName,
    validatePassword
  );

  return pipe(
    validateUser(input),
    E.mapLeft(errors => ({ _tag: 'ValidationError' as const, errors }))
  );
}

export function validateBulkCreateUserInput(inputs: CreateUserInput[]): E.Either<DomainError, CreateUserInput[]> {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    return E.left({
      _tag: 'ValidationError' as const,
      errors: [{ field: 'users', message: 'At least one user must be provided' }]
    });
  }

  const validatedInputs: CreateUserInput[] = [];
  const failedInputs: Array<{ input: CreateUserInput; errors: ValidationError[] }> = [];

  for (const input of inputs) {
    const result = validateCreateUserInput(input);
    if (E.isRight(result)) {
      validatedInputs.push(result.right);
    } else if (result.left._tag === 'ValidationError') {
      failedInputs.push({ input, errors: [...result.left.errors] });
    }
  }

  if (failedInputs.length > 0) {
    return E.left({
      _tag: 'BulkValidationError' as const,
      failedInputs
    });
  }

  return E.right(validatedInputs);
}

const validateEmail = (input: CreateUserInput): E.Either<ValidationError[], CreateUserInput> => {
  const isValid = Boolean(input.email && input.email.includes('@'));
  return isValid
    ? E.right(input)
    : E.left([{ field: 'email', message: 'Invalid email format' }]);
};

const validateName = (input: CreateUserInput): E.Either<ValidationError[], CreateUserInput> => {
  const isValid = Boolean(input.name && input.name.length >= 2);
  return isValid
    ? E.right(input)
    : E.left([{ field: 'name', message: 'Name must be at least 2 characters' }]);
};

const validatePassword = (input: CreateUserInput): E.Either<ValidationError[], CreateUserInput> => {
  const isValid = Boolean(input.password && input.password.length >= 6);
  return isValid
    ? E.right(input)
    : E.left([{ field: 'password', message: 'Password must be at least 6 characters' }]);
};
