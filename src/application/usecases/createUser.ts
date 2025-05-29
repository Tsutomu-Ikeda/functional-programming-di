import * as TE from 'fp-ts/lib/TaskEither'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { pipe } from 'fp-ts/lib/function'
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
    RTE.chainFirstW(() => {
      console.log('sending mail to user:', user.email);

      return RTE.ask<CreateUserDeps>()
    }),
    RTE.chainW((deps) =>
      pipe(
        deps.emailService.sendWelcomeEmail(user),
        TE.map(() => user),
        TE.orElse(handleEmailError(deps.logger, user)),
        RTE.fromTaskEither
      )
    )
  )

const createEmailExistsError = (): TE.TaskEither<DomainError, never> =>
  TE.left<DomainError>({
    _tag: 'ValidationError',
    errors: [{ field: 'email', message: 'Email already exists' }]
  })

const handleUserNotFoundError = (validInput: CreateUserInput) => (error: DomainError): TE.TaskEither<DomainError, CreateUserInput> =>
  error._tag === 'UserNotFound'
    ? TE.right(validInput)
    : TE.left(error)

const logUserCreation = (logger: Logger) => (user: User): TE.TaskEither<DomainError, void> =>
  TE.fromIO(logger.info('Creating user', { userId: user.id }))

const handleEmailError = (logger: Logger, user: User) => (error: DomainError): TE.TaskEither<DomainError, User> => {
  logger.error('Failed to send welcome email',
    new Error(JSON.stringify(error)),
    { userId: user.id }
  )()
  return TE.left(error)
}
