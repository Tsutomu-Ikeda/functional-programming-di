import * as TE from 'fp-ts/TaskEither'
import * as RTE from 'fp-ts/ReaderTaskEither'
import { pipe } from 'fp-ts/function'
import { User } from '../../domain/user'
import { DomainError } from '../../domain/errors'
import { UserRepository, EmailService, Logger } from '../ports'
import { validateCreateUserInput, CreateUserInput } from '../../domain/userValidation'
import { createUserEntity } from '../../domain/userFactory'

export interface CreateUserDeps {
  userRepository: UserRepository
  emailService: EmailService
  logger: Logger
}

export const createUser = (
  input: CreateUserInput
): RTE.ReaderTaskEither<CreateUserDeps, DomainError, User> =>
  pipe(
    RTE.fromEither(validateCreateUserInput(input)),
    RTE.chainW(checkEmailNotExists),
    RTE.chainW(createAndSaveUser),
    RTE.chainFirstW(sendWelcomeEmailSafely)
  )

const checkEmailNotExists = (validInput: CreateUserInput): RTE.ReaderTaskEither<CreateUserDeps, DomainError, CreateUserInput> =>
  pipe(
    RTE.ask<CreateUserDeps>(),
    RTE.chainW((deps) =>
      pipe(
        deps.userRepository.findByEmail(validInput.email),
        TE.chain(() => createEmailExistsError()),
        TE.orElse(handleUserNotFoundError(validInput)),
        RTE.fromTaskEither
      )
    )
  )

const createAndSaveUser = (validInput: CreateUserInput): RTE.ReaderTaskEither<CreateUserDeps, DomainError, User> =>
  pipe(
    RTE.fromEither(createUserEntity(validInput)),
    RTE.chainFirstW((user) =>
      pipe(
        RTE.ask<CreateUserDeps>(),
        RTE.chainTaskEitherK((deps) => logUserCreation(deps.logger)(user))
      )
    ),
    RTE.chainW((user) =>
      pipe(
        RTE.ask<CreateUserDeps>(),
        RTE.chainTaskEitherK((deps) => deps.userRepository.save(user))
      )
    )
  )

const sendWelcomeEmailSafely = (user: User): RTE.ReaderTaskEither<CreateUserDeps, DomainError, User> =>
  pipe(
    RTE.ask<CreateUserDeps>(),
    RTE.chainW((deps) =>
      pipe(
        deps.emailService.sendWelcomeEmail(user),
        TE.orElse(handleEmailError(deps.logger, user)),
        TE.map(() => user),
        RTE.fromTaskEither
      )
    )
  )

const createEmailExistsError = () =>
  TE.left<DomainError>({
    _tag: 'ValidationError',
    errors: [{ field: 'email', message: 'Email already exists' }]
  })

const handleUserNotFoundError = (validInput: CreateUserInput) => (error: DomainError) =>
  error._tag === 'UserNotFound'
    ? TE.right(validInput)
    : TE.left(error)

const logUserCreation = (logger: Logger) => (user: User) =>
  TE.fromIO(logger.info('Creating user', { userId: user.id }))

const handleEmailError = (logger: Logger, user: User) => (error: DomainError) => {
  logger.error('Failed to send welcome email',
    new Error(JSON.stringify(error)),
    { userId: user.id }
  )()
  return TE.right(undefined as void)
}
