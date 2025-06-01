import type * as TE from 'fp-ts/lib/TaskEither';
import type * as IO from 'fp-ts/lib/IO';
import type { User } from '../domain/user';
import type { DomainError } from '../domain/errors';

export interface UserRepository {
  findById: (id: string) => TE.TaskEither<DomainError, User>;
  findByEmail: (email: string) => TE.TaskEither<DomainError, User>;
  save: (user: User) => TE.TaskEither<DomainError, User>;
}

export type UserRepositoryDep = { readonly userRepository: UserRepository };

export interface EmailService {
  sendWelcomeEmail: (user: User) => TE.TaskEither<DomainError, void>;
}

export type EmailServiceDep = { readonly emailService: EmailService };

export interface Logger {
  info: (message: string, context?: object) => IO.IO<void>;
  error: (message: string, error: Error, context?: object) => IO.IO<void>;
}

export type LoggerDep = { readonly logger: Logger };
