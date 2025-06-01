import * as TE from 'fp-ts/lib/TaskEither';
import * as IO from 'fp-ts/lib/IO';
import { User } from '../domain/user';
import { DomainError } from '../domain/errors';

export interface UserRepository {
  findById: (id: string) => TE.TaskEither<DomainError, User>;
  findByEmail: (email: string) => TE.TaskEither<DomainError, User>;
  save: (user: User) => TE.TaskEither<DomainError, User>;
}

export interface EmailService {
  sendWelcomeEmail: (user: User) => TE.TaskEither<DomainError, void>;
}

export interface Logger {
  info: (message: string, context?: object) => IO.IO<void>;
  error: (message: string, error: Error, context?: object) => IO.IO<void>;
}
