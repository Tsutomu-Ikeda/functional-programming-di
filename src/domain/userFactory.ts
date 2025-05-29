import * as E from 'fp-ts/lib/Either';
import { User } from './user';
import { DomainError } from './errors';
import { CreateUserInput } from './userValidation';

export function createUserEntity(input: CreateUserInput): E.Either<DomainError, User> {
  return E.right({
    id: generateId(),
    email: input.email,
    name: input.name,
    role: 'user'
  });
}

const generateId = (): string =>
  Math.random().toString(36).substring(2, 15);
