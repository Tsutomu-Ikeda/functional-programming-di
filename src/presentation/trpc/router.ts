import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';
import * as TE from 'fp-ts/lib/TaskEither';
import * as IO from 'fp-ts/lib/IO';
import * as E from 'fp-ts/lib/Either';
import { pipe } from 'fp-ts/lib/function';
import { createUser } from '../../application/usecases/createUser';
import { bulkCreateUsers } from '../../application/usecases/bulkCreateUsers';
import { ScopedContainer, RequestContext } from '../../infrastructure/di/types';
import { UserRepository, EmailService } from '../../application/ports';
import { RequestScopedLogger } from '../../infrastructure/logging/logger';
import { DomainError } from '../../domain/errors';
import { User } from '../../domain/user';
import { BulkCreateUserResult } from '../../domain/userValidation';
import { parseUsersFromCSV } from '../../infrastructure/csv/csvParser';

export interface TRPCContext {
  container: ScopedContainer;
  requestContext: RequestContext;
}

const t = initTRPC.context<TRPCContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

const createUserInputSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(6)
});

const bulkCreateUsersInputSchema = z.object({
  csvContent: z.string().min(1)
});

// Types for better type safety
interface SuccessResponse<T> {
  readonly success: true;
  readonly data: T;
}

type TRPCResponse<T> = SuccessResponse<T>;

// Pure function to create request-scoped logger
const createRequestLogger = (requestContext: RequestContext): IO.IO<RequestScopedLogger> =>
  () => new RequestScopedLogger(requestContext);

// Pure function to resolve dependencies from container
const resolveDependencies = (container: ScopedContainer): TE.TaskEither<TRPCError, {
  userRepository: UserRepository;
  emailService: EmailService;
}> =>
  pipe(
    TE.tryCatch(
      async () => {
        const userRepository = await container.resolve<UserRepository>('userRepository');
        const emailService = await container.resolve<EmailService>('emailService');
        return { userRepository, emailService };
      },
      () => new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to resolve dependencies'
      })
    )
  );

// Pure function to resolve user repository
const resolveUserRepository = (container: ScopedContainer): TE.TaskEither<TRPCError, UserRepository> =>
  pipe(
    TE.tryCatch(
      () => container.resolve<UserRepository>('userRepository'),
      () => new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to resolve user repository'
      })
    )
  );

// Pure function to map domain errors to TRPC errors
const mapDomainErrorToTRPCError = (error: DomainError): TRPCError => {
  switch (error._tag) {
    case 'ValidationError': {
      return new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Validation failed',
        cause: error.errors.map(e => (`${e.field}: ${e.message}`)).join(',')
      });
    }
    case 'BulkValidationError': {
      return new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Bulk validation failed',
        cause: JSON.stringify({ 
          failedInputs: error.failedInputs.map(f => ({
            input: f.input,
            errors: f.errors.map(e => `${e.field}: ${e.message}`)
          }))
        })
      });
    }
    case 'CSVParsingError': {
      return new TRPCError({
        code: 'BAD_REQUEST',
        message: 'CSV parsing failed',
        cause: JSON.stringify({ message: error.message })
      });
    }
    case 'UserNotFound': {
      return new TRPCError({
        code: 'NOT_FOUND',
        message: 'User not found',
        cause: JSON.stringify({ userId: error.userId })
      });
    }
    case 'DatabaseError': {
      return new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Database error',
        cause: JSON.stringify({ message: error.message })
      });
    }
    case 'EmailServiceError':
      return new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Email service error',
        cause: new Error(error.message)
      });
    default:
      return new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error'
      });
  }
};

// Pure function to create success response
const createSuccessResponse = <T>(data: T): SuccessResponse<T> => ({
  success: true,
  data
});

// Higher-order function to handle TaskEither results in TRPC procedures
const handleTaskEitherResult = <T>(
  taskEither: TE.TaskEither<DomainError, T>
): TE.TaskEither<TRPCError, TRPCResponse<T>> =>
  pipe(
    taskEither,
    TE.bimap(
      mapDomainErrorToTRPCError,
      createSuccessResponse
    )
  );

// Pure function to execute create user use case
const executeCreateUser = (
  input: z.infer<typeof createUserInputSchema>,
  deps: { userRepository: UserRepository; emailService: EmailService; logger: RequestScopedLogger }
): TE.TaskEither<DomainError, User> =>
  createUser(input)(deps);

// Pure function to execute bulk create users use case
const executeBulkCreateUsers = (
  csvContent: string,
  deps: { userRepository: UserRepository; emailService: EmailService; logger: RequestScopedLogger }
): TE.TaskEither<DomainError, BulkCreateUserResult> => {
  const parseResult = parseUsersFromCSV(csvContent);
  
  if (E.isLeft(parseResult)) {
    return TE.left(parseResult.left);
  }
  
  const userInputs = parseResult.right;
  return bulkCreateUsers(userInputs)(deps);
};

// Pure function to execute get user by ID
const executeGetUserById = (
  userRepository: UserRepository,
  userId: string
): TE.TaskEither<DomainError, User> =>
  userRepository.findById(userId);

// TRPC procedure wrapper that converts TaskEither to Promise
const withTaskEither = <T>(
  taskEither: TE.TaskEither<TRPCError, T>
): Promise<T> =>
  pipe(
    taskEither,
    TE.matchE(
      (error) => () => Promise.reject(error),
      (result) => () => Promise.resolve(result)
    )
  )();

export const appRouter = router({
  user: router({
    create: publicProcedure
      .input(createUserInputSchema)
      .mutation(async ({ input, ctx }) => {
        const program = pipe(
          resolveDependencies(ctx.container),
          TE.map(deps => ({
            ...deps,
            logger: createRequestLogger(ctx.requestContext)()
          })),
          TE.flatMap(deps =>
            pipe(
              executeCreateUser(input, deps),
              handleTaskEitherResult
            )
          )
        );

        return withTaskEither(program);
      }),

    bulkCreate: publicProcedure
      .input(bulkCreateUsersInputSchema)
      .mutation(async ({ input, ctx }) => {
        const program = pipe(
          resolveDependencies(ctx.container),
          TE.map(deps => ({
            ...deps,
            logger: createRequestLogger(ctx.requestContext)()
          })),
          TE.flatMap(deps =>
            pipe(
              executeBulkCreateUsers(input.csvContent, deps),
              handleTaskEitherResult
            )
          )
        );

        return withTaskEither(program);
      }),

    getById: publicProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input, ctx }) => {
        const program = pipe(
          resolveUserRepository(ctx.container),
          TE.flatMap(userRepository =>
            pipe(
              executeGetUserById(userRepository, input.id),
              handleTaskEitherResult
            )
          )
        );

        return withTaskEither(program);
      })
  })
});

export type AppRouter = typeof appRouter;
