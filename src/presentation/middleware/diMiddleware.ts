import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as TE from 'fp-ts/lib/TaskEither';
import * as T from 'fp-ts/lib/Task';
import * as IO from 'fp-ts/lib/IO';
import * as E from 'fp-ts/lib/Either';
import { pipe } from 'fp-ts/lib/function';
import { DIContainer, RequestContext, ScopedContainer } from '../../infrastructure/di/types';
import { RequestScopedLogger } from '../../infrastructure/logging/logger';

export interface AuthenticatedRequest extends Request {
  container: ScopedContainer;
  context: RequestContext;
}

// Error types for middleware
type MiddlewareError =
  | { readonly _tag: 'ContainerScopeError'; readonly message: string }
  | { readonly _tag: 'LoggerError'; readonly message: string }
  | { readonly _tag: 'RequestContextError'; readonly message: string };

// Pure function to create request context
const createRequestContext = (req: Request): IO.IO<RequestContext> => () => ({
  requestId: uuidv4(),
  startTime: new Date(),
  metadata: {
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    method: req.method,
    url: req.url,
  },
});

// Create scoped container
const createScopedContainer = (globalContainer: DIContainer, context: RequestContext): TE.TaskEither<MiddlewareError, ScopedContainer> =>
  pipe(
    TE.tryCatch(
      async () => globalContainer.createScope(context),
      (error) => ({
        _tag: 'ContainerScopeError' as const,
        message: error instanceof Error ? error.message : 'Unknown container scope error',
      }),
    ),
  );

// Create and log request start
const logRequestStart = (context: RequestContext, req: Request): TE.TaskEither<MiddlewareError, RequestScopedLogger> =>
  pipe(
    TE.tryCatch(
      async () => {
        const logger = new RequestScopedLogger(context);
        logger.info('Request started', {
          method: req.method,
          url: req.url,
          userAgent: req.get('User-Agent'),
        })();
        return logger;
      },
      (error) => ({
        _tag: 'LoggerError' as const,
        message: error instanceof Error ? error.message : 'Unknown logger error',
      }),
    ),
  );

// Setup response cleanup handler
const setupResponseCleanup = (
  res: Response,
  context: RequestContext,
  logger: RequestScopedLogger,
  scopedContainer: ScopedContainer,
): IO.IO<void> => () => {
  res.on('finish', async () => {
    const duration = Date.now() - context.startTime.getTime();

    // Log request completion (IO operation, no await needed)
    try {
      logger.info('Request completed', {
        statusCode: res.statusCode,
        duration: `${duration}ms`,
      })();
    } catch {
      // Ignore logging errors during cleanup
    }

    // Dispose scoped container
    try {
      await scopedContainer.dispose();
    } catch {
      // Ignore disposal errors during cleanup
    }
  });
};

// Attach context and container to request
const attachToRequest = (
  req: Request,
  context: RequestContext,
  scopedContainer: ScopedContainer,
): IO.IO<AuthenticatedRequest> => () => {
  const authReq = req as AuthenticatedRequest;
  authReq.container = scopedContainer;
  authReq.context = context;
  return authReq;
};

// Process request with fp-ts pipeline
const processRequest = (
  globalContainer: DIContainer,
  req: Request,
  res: Response,
): TE.TaskEither<MiddlewareError, AuthenticatedRequest> => {
  const context = createRequestContext(req)();

  return pipe(
    createScopedContainer(globalContainer, context),
    TE.tap(scopedContainer =>
      pipe(
        logRequestStart(context, req),
        TE.map(logger => {
          setupResponseCleanup(res, context, logger, scopedContainer)();
          return logger;
        }),
      ),
    ),
    TE.map(scopedContainer => attachToRequest(req, context, scopedContainer)()),
  );
};

// Handle middleware errors
const handleMiddlewareError = (error: MiddlewareError, next: NextFunction): IO.IO<void> => () => {
  console.error('DI Middleware error:', error);

  const expressError = new Error(
    error._tag === 'ContainerScopeError' ? 'Failed to create request scope' :
    error._tag === 'LoggerError' ? 'Failed to initialize request logging' :
    error._tag === 'RequestContextError' ? 'Failed to create request context' :
    'Unknown middleware error',
  );

  next(expressError);
};

// Main middleware factory function
export const createDIMiddleware = (globalContainer: DIContainer) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await processRequest(globalContainer, req, res)();

      pipe(
        result,
        E.match(
          (error) => handleMiddlewareError(error, next)(),
          () => {
            // The request object has been modified in-place by attachToRequest
            next();
          },
        ),
      );
    } catch (error) {
      // Handle any unexpected errors
      const middlewareError = {
        _tag: 'ContainerScopeError' as const,
        message: error instanceof Error ? error.message : 'Unknown middleware error',
      };
      handleMiddlewareError(middlewareError, next)();
    }
  };
};

// Alternative functional approach for creating middleware
export const createDIMiddlewareFP = (globalContainer: DIContainer) =>
  (req: Request, res: Response, next: NextFunction): T.Task<void> =>
    pipe(
      processRequest(globalContainer, req, res),
      TE.matchE(
        (error) => T.fromIO(handleMiddlewareError(error, next)),
        () => T.fromIO(() => {
          // The request object has been modified in-place by attachToRequest
          next();
        }),
      ),
    );

// Pure function to create middleware configuration
export const createMiddlewareConfig = (globalContainer: DIContainer): {
  container: DIContainer;
  middleware: (req: Request, res: Response, next: NextFunction) => Promise<void>;
  middlewareFP: (req: Request, res: Response, next: NextFunction) => T.Task<void>;
} => ({
  container: globalContainer,
  middleware: createDIMiddleware(globalContainer),
  middlewareFP: createDIMiddlewareFP(globalContainer),
});
