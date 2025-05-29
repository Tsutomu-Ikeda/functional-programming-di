import express from 'express';
import * as TE from 'fp-ts/lib/TaskEither';
import * as IO from 'fp-ts/lib/IO';
import * as E from 'fp-ts/lib/Either';
import { pipe } from 'fp-ts/lib/function';
import { createContainer } from '../infrastructure/di/container';
import { registerServices, createDefaultConfig } from '../infrastructure/di/registry';
import { createDIMiddleware } from './middleware/diMiddleware';
import { createUserRoutes } from './rest/routes/userRoutes';
import { DIContainer } from '../infrastructure/di/types';

// Types for server configuration and state
interface ServerConfig {
  readonly port: number;
}

interface ServerState {
  readonly app: express.Application;
  readonly container: DIContainer;
  readonly config: ServerConfig;
}

// Error types
type ServerError =
  | { readonly _tag: 'ContainerInitializationError'; readonly message: string }
  | { readonly _tag: 'MiddlewareSetupError'; readonly message: string }
  | { readonly _tag: 'ServerStartError'; readonly message: string; readonly port: number };

// Pure function to create Express app with basic middleware
const createExpressApp = (): IO.IO<express.Application> => () => {
  const app = express();

  // Basic middleware setup
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // CORS middleware
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  });

  return app;
};

// Initialize DI container
const initializeContainer = (): TE.TaskEither<ServerError, DIContainer> =>
  pipe(
    TE.tryCatch(
      async () => {
        const container = createContainer();
        const config = createDefaultConfig();
        await registerServices(container, config);
        return container;
      },
      (error) => ({
        _tag: 'ContainerInitializationError' as const,
        message: error instanceof Error ? error.message : 'Unknown container initialization error'
      })
    )
  );

// Setup health check endpoint
const setupHealthEndpoint = (app: express.Application): IO.IO<void> => () => {
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        rest: 'available at /api',
        endpoints: {
          'POST /api/users': 'Create a new user',
          'GET /api/users/:id': 'Get user by ID'
        }
      }
    });
  });
};

// Setup API documentation endpoint
const setupApiDocsEndpoint = (app: express.Application): IO.IO<void> => () => {
  app.get('/api', (req, res) => {
    res.json({
      name: 'Clean Architecture API',
      version: '1.0.0',
      description: 'API built with Clean Architecture principles and DI',
      endpoints: {
        'POST /api/users': {
          description: 'Create a new user',
          body: {
            email: 'string (required)',
            name: 'string (required)',
            password: 'string (required, min 6 chars)'
          }
        },
        'GET /api/users/:id': {
          description: 'Get user by ID',
          params: {
            id: 'string (required)'
          }
        }
      }
    });
  });
};

// Setup error handling middleware
const setupErrorHandling = (app: express.Application): IO.IO<void> => () => {
  app.use((error: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {

    console.error('Unhandled error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      requestId: (req as express.Request & { context?: { requestId?: string } }).context?.requestId
    });
  });
};

// Setup all middleware and routes
const setupMiddlewareAndRoutes = (app: express.Application, container: DIContainer): TE.TaskEither<ServerError, express.Application> =>
  pipe(
    TE.tryCatch(
      async () => {
        // Setup DI middleware
        app.use(createDIMiddleware(container));

        // Setup REST API routes
        app.use('/api', createUserRoutes());

        // Setup endpoints
        pipe(
          setupHealthEndpoint(app),
          IO.chain(() => setupApiDocsEndpoint(app)),
          IO.chain(() => setupErrorHandling(app))
        )();

        return app;
      },
      (error) => ({
        _tag: 'MiddlewareSetupError' as const,
        message: error instanceof Error ? error.message : 'Unknown middleware setup error'
      })
    )
  );

// Initialize complete server state
const initializeServerState = (config: ServerConfig): TE.TaskEither<ServerError, ServerState> =>
  pipe(
    initializeContainer(),
    TE.chain(container =>
      pipe(
        setupMiddlewareAndRoutes(createExpressApp()(), container),
        TE.map(app => ({
          app,
          container,
          config
        }))
      )
    )
  );

// Start the server
const startServer = (state: ServerState): TE.TaskEither<ServerError, ServerState> =>
  pipe(
    TE.tryCatch(
      () => new Promise<ServerState>((resolve, reject) => {
        try {
          state.app.listen(state.config.port, () => {

            console.log(`🚀 Server running on port ${state.config.port}`);

            console.log(`📡 REST API: http://localhost:${state.config.port}/api`);

            console.log(`❤️ Health: http://localhost:${state.config.port}/health`);

            console.log(`📚 API Docs: http://localhost:${state.config.port}/api`);
            resolve(state);
          });
        } catch (error) {
          reject(error);
        }
      }),
      (error) => ({
        _tag: 'ServerStartError' as const,
        message: error instanceof Error ? error.message : 'Unknown server start error',
        port: state.config.port
      })
    )
  );

// Stop the server
const stopServer = (state: ServerState): TE.TaskEither<ServerError, void> =>
  pipe(
    TE.tryCatch(
      async () => {
        // Close database connections and other cleanup
        // await state.container.dispose();
      },
      (error) => ({
        _tag: 'ServerStartError' as const,
        message: error instanceof Error ? error.message : 'Unknown server stop error',
        port: state.config.port
      })
    )
  );

export class ApplicationServer {
  private state: ServerState | null = null;

  // Initialize and start the server
  async start(port: number = 3000): Promise<E.Either<ServerError, void>> {
    const config: ServerConfig = { port };

    const result = await pipe(
      initializeServerState(config),
      TE.chain(startServer),
      TE.map(state => {
        this.state = state;
      })
    )();

    return result;
  }

  // Stop the server
  async stop(): Promise<E.Either<ServerError, void>> {
    if (!this.state) {
      return E.right(undefined);
    }

    return await stopServer(this.state)();
  }

  // Get current server state (for testing purposes)
  getState(): ServerState | null {
    return this.state;
  }
}

// Factory function using fp-ts
export const createServer = (): IO.IO<ApplicationServer> => () => new ApplicationServer();

// Functional approach to create and start server
export const createAndStartServer = (port: number = 3000): TE.TaskEither<ServerError, ApplicationServer> =>
  pipe(
    TE.of(createServer()()),
    TE.chainFirst(server =>
      TE.fromTask(() => server.start(port).then(result =>
        E.isLeft(result) ? Promise.reject(result.left) : Promise.resolve(undefined)
      ))
    )
  );
