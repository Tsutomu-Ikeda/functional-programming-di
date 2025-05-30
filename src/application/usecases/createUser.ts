import * as TE from 'fp-ts/lib/TaskEither';
import * as RTE from 'fp-ts/lib/ReaderTaskEither';
import { pipe } from 'fp-ts/lib/function';
import { User } from '../../domain/user';
import { DomainError } from '../../domain/errors';
import { UserRepository, EmailService, Logger } from '../ports';
import { validateCreateUserInput, CreateUserInput } from '../../domain/userValidation';
import { createUserEntity } from '../../domain/userFactory';

export type CreateUserDeps = {
  userRepository: UserRepository
  emailService: EmailService
  logger: Logger
}

export const createUser = (
  input: CreateUserInput
): RTE.ReaderTaskEither<CreateUserDeps, DomainError, User> =>
  pipe(
    RTE.fromEither(validateCreateUserInput(input)),
    RTE.tap(checkEmailNotExists),
    RTE.flatMap(createAndSaveUser),
    RTE.tap(sendWelcomeEmailSafely)
  );

const checkEmailNotExists = (validInput: CreateUserInput): RTE.ReaderTaskEither<CreateUserDeps, DomainError, CreateUserInput> =>
  pipe(
    RTE.ask<CreateUserDeps>(),
    RTE.flatMap(({ userRepository }) =>
      pipe(
        userRepository.findByEmail(validInput.email),
        TE.flatMap(() => TE.left<DomainError>({
          _tag: 'ValidationError',
          errors: [{ field: 'email', message: 'Email already exists' }]
        })),
        TE.orElse((error) =>
          error._tag === 'UserNotFound'
            ? TE.right(validInput)
            : TE.left(error)),
        RTE.fromTaskEither
      )
    )
  );

const createAndSaveUser = (validInput: CreateUserInput): RTE.ReaderTaskEither<CreateUserDeps, DomainError, User> =>
  pipe(
    RTE.fromEither(createUserEntity(validInput)),
    RTE.tap((user) =>
      pipe(
        RTE.ask<CreateUserDeps>(),
        RTE.flatMapTaskEither(({ logger }) => TE.fromIO(logger.info('Creating user', { userId: user.id })))
      )
    ),
    RTE.flatMap((user) =>
      pipe(
        RTE.ask<CreateUserDeps>(),
        RTE.flatMapTaskEither(({ userRepository }) => userRepository.save(user))
      )
    )
  );

const sendWelcomeEmailSafely = (user: User): RTE.ReaderTaskEither<CreateUserDeps, DomainError, User> =>
  pipe(
    RTE.ask<CreateUserDeps>(),
    RTE.flatMap(({ emailService, logger }) =>
      pipe(
        emailService.sendWelcomeEmail(user),
        TE.map(() => user),
        TE.orElse((error) => {
          logger.error('Failed to send welcome email', new Error(JSON.stringify(error)), { userId: user.id });
          return TE.left(error);
        }),
        RTE.fromTaskEither
      )
    )
  );
