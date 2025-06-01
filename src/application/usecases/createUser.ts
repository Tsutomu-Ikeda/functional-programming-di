import * as TE from 'fp-ts/lib/TaskEither';
import * as RTE from 'fp-ts/lib/ReaderTaskEither';
import { pipe } from 'fp-ts/lib/function';
import { User } from '../../domain/user';
import { DomainError } from '../../domain/errors';
import { UserRepository, EmailService, Logger } from '../ports';
import { validateCreateUserInput, CreateUserInput } from '../../domain/userValidation';
import { createUserEntity } from '../../domain/userFactory';
import { createEffect } from '../combinators';

export type CreateUserDeps = {
  userRepository: UserRepository
  emailService: EmailService
  logger: Logger
}

const effects = createEffect<CreateUserDeps>();

export const createUser = (input: CreateUserInput) =>
  pipe(
    RTE.fromEither(validateCreateUserInput(input)),
    RTE.tap(checkEmailNotExists),
    RTE.flatMap(createAndSaveUser),
    RTE.tap(effects.sync(
      ({ logger }, user) => logger.info('User created successfully', { userId: user.id }),
    )),
    RTE.tap(sendWelcomeEmail),
  );

const checkEmailNotExists = effects.async<CreateUserInput, DomainError>(
  ({ userRepository }, validInput,) =>
    pipe(
      userRepository.findByEmail(validInput.email),
      TE.flatMap(() => TE.left<DomainError>({
        _tag: 'ValidationError',
        errors: [{ field: 'email', message: 'Email already exists' }],
      })),
      TE.orElse((error) =>
        error._tag === 'UserNotFound'
          ? TE.right(undefined)
          : TE.left(error)),
    )
);

const createAndSaveUser = effects.asyncTransform<CreateUserInput, User, DomainError>(
  ({ userRepository, logger }, validInput) =>
    pipe(
      TE.fromEither(createUserEntity(validInput)),
      TE.tap((user) => TE.fromIO(() => logger.info('Creating user entity', { userId: user.id }))),
      TE.flatMap((user) => userRepository.save(user)),
    ),
);

const sendWelcomeEmail = effects.async<User, DomainError>(
  ({ emailService, logger }, user) =>
    pipe(
      emailService.sendWelcomeEmail(user),
      TE.orElse((error) => {
        logger.error('Failed to send welcome email', new Error(JSON.stringify(error)), { userId: user.id });
        return TE.left(error);
      }),
    ),
);
