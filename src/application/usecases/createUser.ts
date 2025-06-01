import * as TE from 'fp-ts/lib/TaskEither';
import * as RTE from 'fp-ts/lib/ReaderTaskEither';
import { pipe } from 'fp-ts/lib/function';

import { User } from '../../domain/user';
import { DomainError } from '../../domain/errors';
import { UserRepository, EmailService, Logger } from '../ports';
import { CreateUserInput, validateCreateUserInput } from '../../domain/userValidation';
import { createUserEntity } from '../../domain/userFactory';
import { fx } from '../combinators/fluent';

export type LoggerDep = { readonly logger: Logger };
export type UserRepositoryDep = { readonly userRepository: UserRepository };
export type EmailServiceDep = { readonly emailService: EmailService };

const checkEmailNotExists =
  fx.async<CreateUserInput>().has<UserRepositoryDep>()(({ userRepository }, input) =>
    pipe(
      userRepository.findByEmail(input.email),
      TE.matchE(
        (err) => (err._tag === 'UserNotFound' ? TE.right<void>(undefined) : TE.left(err)),
        () =>
          TE.left<DomainError>({
            _tag: 'ValidationError',
            errors: [{ field: 'email', message: 'Email already exists' }],
          }),
      ),
    ),
  );

const createAndSaveUser =
  fx.async<CreateUserInput, User>().has<UserRepositoryDep & LoggerDep>()(
    ({ userRepository, logger }, input) =>
      pipe(
        TE.fromEither(createUserEntity(input)),
        TE.tap((user) => TE.fromIO(() => logger.info('Creating user entity', { userId: user.id }))),
        TE.flatMap((user) => userRepository.save(user)),
      ),
  );

const sendWelcomeEmail =
  fx.async<User>().has<EmailServiceDep & LoggerDep>()(({ emailService, logger }, user) =>
    pipe(
      emailService.sendWelcomeEmail(user),
      TE.orElse((err) => {
        logger.error('Failed to send welcome email', new Error(JSON.stringify(err)), { userId: user.id });
        return TE.left(err);
      }),
    ),
  );

const logUserCreated =
  fx.sync<User>().has<LoggerDep>()(({ logger }, user) =>
    logger.info('User created successfully', { userId: user.id }),
  );

export const createUser = (input: CreateUserInput) =>
  pipe(
    RTE.fromEither(validateCreateUserInput(input)),
    RTE.chainW(checkEmailNotExists(input)),
    RTE.chainW(createAndSaveUser(input)),
    RTE.tapW(logUserCreated(undefined)),
    RTE.tapW(sendWelcomeEmail),
  );
