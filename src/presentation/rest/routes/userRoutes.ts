import { Router, Request, Response, NextFunction } from 'express';
import * as TE from 'fp-ts/lib/TaskEither';
import * as E from 'fp-ts/lib/Either';
import * as IO from 'fp-ts/lib/IO';
import * as O from 'fp-ts/lib/Option';
import * as R from 'fp-ts/lib/Record';
import { pipe } from 'fp-ts/lib/function';
import { createUser } from '../../../application/usecases/createUser';
import { ScopedContainer, RequestContext } from '../../../infrastructure/di/types';
import { UserRepository, EmailService } from '../../../application/ports';
import { RequestScopedLogger } from '../../../infrastructure/logging/logger';
import { CreateUserInput } from '../../../domain/userValidation';
import { DomainError } from '../../../domain/errors';
import { User } from '../../../domain/user';

export interface AuthenticatedRequest extends Request {
  container: ScopedContainer;
  context: RequestContext;
}

// Types for route handling
interface RouteContext {
  readonly container: ScopedContainer;
  readonly requestContext: RequestContext;
  readonly logger: RequestScopedLogger;
}

interface CreateUserRouteInput {
  readonly input: CreateUserInput;
  readonly context: RouteContext;
}

interface GetUserRouteInput {
  readonly userId: string;
  readonly context: RouteContext;
}

// Error types for route handling
type RouteError =
  | { readonly _tag: 'DependencyResolutionError'; readonly message: string }
  | { readonly _tag: 'RouteProcessingError'; readonly message: string }
  | DomainError;

// Pure function to create route context
const createRouteContext = (authReq: AuthenticatedRequest): IO.IO<RouteContext> => () => ({
  container: authReq.container,
  requestContext: authReq.context,
  logger: new RequestScopedLogger(authReq.context)
});

// Resolve dependencies for create user use case
const resolveDependencies = (context: RouteContext): TE.TaskEither<RouteError, {
  userRepository: UserRepository;
  emailService: EmailService;
  logger: RequestScopedLogger;
}> =>
  pipe(
    TE.tryCatch(
      async () => {
        const userRepository = await context.container.resolve<UserRepository>('userRepository');
        const emailService = await context.container.resolve<EmailService>('emailService');
        return {
          userRepository,
          emailService,
          logger: context.logger
        };
      },
      (error) => ({
        _tag: 'DependencyResolutionError' as const,
        message: error instanceof Error ? error.message : 'Unknown dependency resolution error'
      })
    )
  );

// Execute create user use case
const executeCreateUser = (input: CreateUserInput, deps: {
  userRepository: UserRepository;
  emailService: EmailService;
  logger: RequestScopedLogger;
}): TE.TaskEither<RouteError, User> =>
  pipe(
    TE.tryCatch(
      createUser(input)(deps),
      (error) => ({
        _tag: 'RouteProcessingError' as const,
        message: error instanceof Error ? error.message : 'Unknown processing error'
      } as RouteError)
    ),
    TE.flatMap(result =>
      E.isLeft(result)
        ? TE.left(result.left as RouteError)
        : TE.right(result.right)
    )
  );

// Execute get user by ID
const executeGetUser = (userId: string, userRepository: UserRepository): TE.TaskEither<RouteError, User> =>
  pipe(
    TE.tryCatch(
      () => userRepository.findById(userId)(),
      (error) => ({
        _tag: 'RouteProcessingError' as const,
        message: error instanceof Error ? error.message : 'Unknown processing error'
      } as RouteError)
    ),
    TE.flatMap(result =>
      E.isLeft(result)
        ? TE.left(result.left as RouteError)
        : TE.right(result.right)
    )
  );

// Pure function to create success response
const createSuccessResponse = (data: unknown, _statusCode: number = 200): { success: boolean; data: unknown } => ({
  success: true,
  data
});

// Types for HTTP responses
interface HttpResponse {
  readonly statusCode: number;
  readonly body: unknown;
}

interface ErrorResponseBody {
  readonly success: false;
  readonly error: string;
  readonly details?: unknown;
}

// Pure functions for creating specific error responses
const createValidationErrorResponse = (errors: readonly unknown[]): IO.IO<HttpResponse> => () => ({
  statusCode: 400,
  body: {
    success: false,
    error: 'Validation failed',
    details: errors
  } as ErrorResponseBody
});

const createUserNotFoundResponse = (userId: string): IO.IO<HttpResponse> => () => ({
  statusCode: 404,
  body: {
    success: false,
    error: 'User not found',
    details: { userId }
  } as ErrorResponseBody
});

const createDatabaseErrorResponse = (message: string): IO.IO<HttpResponse> => () => ({
  statusCode: 500,
  body: {
    success: false,
    error: 'Database error',
    details: { message }
  } as ErrorResponseBody
});

const createEmailServiceErrorResponse = (message: string): IO.IO<HttpResponse> => () => ({
  statusCode: 500,
  body: {
    success: false,
    error: 'Email service error',
    details: { message }
  } as ErrorResponseBody
});

const createDependencyResolutionErrorResponse = (message: string): IO.IO<HttpResponse> => () => ({
  statusCode: 500,
  body: {
    success: false,
    error: 'Service unavailable',
    details: { message }
  } as ErrorResponseBody
});

const createRouteProcessingErrorResponse = (message: string): IO.IO<HttpResponse> => () => ({
  statusCode: 500,
  body: {
    success: false,
    error: 'Processing error',
    details: { message }
  } as ErrorResponseBody
});

const createInternalServerErrorResponse = (): IO.IO<HttpResponse> => () => ({
  statusCode: 500,
  body: {
    success: false,
    error: 'Internal server error'
  } as ErrorResponseBody
});

// Error handler mapping using Record
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const errorHandlers: Record<string, (error: any) => IO.IO<HttpResponse>> = {
  ValidationError: (error: Extract<RouteError, { _tag: 'ValidationError' }>) =>
    createValidationErrorResponse(error.errors),
  UserNotFound: (error: Extract<RouteError, { _tag: 'UserNotFound' }>) =>
    createUserNotFoundResponse(error.userId),
  DatabaseError: (error: Extract<RouteError, { _tag: 'DatabaseError' }>) =>
    createDatabaseErrorResponse(error.message),
  EmailServiceError: (error: Extract<RouteError, { _tag: 'EmailServiceError' }>) =>
    createEmailServiceErrorResponse(error.message),
  DependencyResolutionError: (error: Extract<RouteError, { _tag: 'DependencyResolutionError' }>) =>
    createDependencyResolutionErrorResponse(error.message),
  RouteProcessingError: (error: Extract<RouteError, { _tag: 'RouteProcessingError' }>) =>
    createRouteProcessingErrorResponse(error.message),
  InvalidEmail: (error: Extract<RouteError, { _tag: 'InvalidEmail' }>) =>
    createValidationErrorResponse([{ field: 'email', message: `Invalid email: ${error.email}` }]),
  Unauthorized: (error: Extract<RouteError, { _tag: 'Unauthorized' }>) =>
    pipe(
      IO.of({
        statusCode: 401,
        body: {
          success: false,
          error: 'Unauthorized',
          details: { reason: error.reason }
        } as ErrorResponseBody
      })
    )
};

// Pure function to create error response using fp-ts Record lookup and Option
const createErrorResponse = (error: RouteError): IO.IO<HttpResponse> =>
  pipe(
    R.lookup(error._tag)(errorHandlers),
    O.map(handler => handler(error)),
    O.getOrElse(() => createInternalServerErrorResponse())
  );

// Send response using fp-ts
const sendResponse = (res: Response, result: E.Either<RouteError, User>, successStatusCode: number = 200): IO.IO<void> => () => {
  pipe(
    result,
    E.match(
      (error) => {
        const errorResponse = createErrorResponse(error)();
        res.status(errorResponse.statusCode).json(errorResponse.body);
      },
      (data) => {
        const successResponse = createSuccessResponse(data, successStatusCode);
        res.status(successStatusCode).json(successResponse);
      }
    )
  );
};

// Process create user route
const processCreateUserRoute = (routeInput: CreateUserRouteInput): TE.TaskEither<RouteError, User> =>
  pipe(
    resolveDependencies(routeInput.context),
    TE.flatMap(deps => executeCreateUser(routeInput.input, deps))
  );

// Process get user route
const processGetUserRoute = (routeInput: GetUserRouteInput): TE.TaskEither<RouteError, User> =>
  pipe(
    TE.tryCatch(
      () => routeInput.context.container.resolve<UserRepository>('userRepository'),
      (error) => ({
        _tag: 'DependencyResolutionError' as const,
        message: error instanceof Error ? error.message : 'Unknown dependency resolution error'
      })
    ),
    TE.flatMap(userRepository => executeGetUser(routeInput.userId, userRepository))
  );

// Create user route handler
const createUserHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const input: CreateUserInput = req.body;
    const context = createRouteContext(authReq)();

    const routeInput: CreateUserRouteInput = { input, context };

    const result = await processCreateUserRoute(routeInput)();

    sendResponse(res, result, 201)();
  } catch (error) {
    next(error);
  }
};

// Get user route handler
const getUserHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { id: userId } = req.params;
    const context = createRouteContext(authReq)();

    const routeInput: GetUserRouteInput = { userId, context };

    const result = await processGetUserRoute(routeInput)();

    sendResponse(res, result)();
  } catch (error) {
    next(error);
  }
};

// Factory function to create router with fp-ts patterns
export const createUserRoutes = (): Router => {
  const router = Router();

  router.post('/users', createUserHandler);
  router.get('/users/:id', getUserHandler);

  return router;
};

// Alternative functional approach for creating routes
export const createUserRoutesFP = (): IO.IO<Router> => () => {
  const router = Router();

  router.post('/users', createUserHandler);
  router.get('/users/:id', getUserHandler);

  return router;
};

// Pure function to create route configuration
export const createRouteConfig = (): {
  routes: Array<{ method: string; path: string; handler: (req: Request, res: Response, next: NextFunction) => Promise<void> }>;
  router: Router;
  routerFP: () => IO.IO<Router>;
} => ({
  routes: [
    { method: 'POST', path: '/users', handler: createUserHandler },
    { method: 'GET', path: '/users/:id', handler: getUserHandler }
  ],
  router: createUserRoutes(),
  routerFP: createUserRoutesFP
});
