import * as RTE from 'fp-ts/lib/ReaderTaskEither';
import * as TE from 'fp-ts/lib/TaskEither';
import { pipe } from 'fp-ts/lib/function';
import type { DomainError } from '../../domain/errors';
import type { User } from '../../domain/user';
import { createUserEntity } from '../../domain/userFactory';
import type { CreateUserInput } from '../../domain/userValidation';
import { validateCreateUserInput } from '../../domain/userValidation';
import { fx } from '../combinators';
import type { EmailServiceDep, LoggerDep, UserRepositoryDep } from '../ports';

export type CreateUserDeps = Parameters<ReturnType<typeof createUser>>[0];

export const createUser = (input: CreateUserInput) =>
  pipe(
    RTE.fromEither(validateCreateUserInput(input)),
    RTE.tap(checkEmailNotExists),
    RTE.flatMap(createAndSaveUser),
    RTE.tap(
      fx.sync<User>().has<LoggerDep>()(({ logger }, user) =>
        logger.info('User created successfully', { userId: user.id }),
      ),
    ),
    RTE.tap(sendWelcomeEmail),
  );

const checkEmailNotExists = fx.async<CreateUserInput>().has<UserRepositoryDep>()(({ userRepository }, validInput) =>
  pipe(
    userRepository.findByEmail(validInput.email),
    TE.flatMap(() =>
      TE.left<DomainError>({
        _tag: 'ValidationError',
        errors: [{ field: 'email', message: 'Email already exists' }],
      }),
    ),
    TE.orElse((error) => (error._tag === 'UserNotFound' ? TE.right(undefined) : TE.left(error))),
  ),
);

const createAndSaveUser = fx.async<CreateUserInput, User>().has<UserRepositoryDep & LoggerDep>()(
  ({ userRepository, logger }, validInput) =>
    pipe(
      TE.fromEither(createUserEntity(validInput)),
      TE.tap((user) => TE.fromIO(() => logger.info('Creating user entity', { userId: user.id }))),
      TE.flatMap((user) => userRepository.save(user)),
    ),
);

const sendWelcomeEmail = fx.async<User>().has<EmailServiceDep & LoggerDep>()(({ emailService, logger }, user) =>
  pipe(
    emailService.sendWelcomeEmail(user),
    TE.orElse((error) => {
      logger.error('Failed to send welcome email', new Error(JSON.stringify(error)), { userId: user.id });
      return TE.left(error);
    }),
  ),
);
