import { pipe } from 'fp-ts/lib/function';
import { createUser } from '../../application/usecases/createUser';
import { ScopedContainer, RequestContext } from '../../infrastructure/di/types';
import { UserRepository, EmailService } from '../../application/ports';
import { RequestScopedLogger } from '../../infrastructure/logging/logger';
import { CreateUserInput } from '../../domain/userValidation';

export interface GraphQLContext {
  container: ScopedContainer;
  requestContext: RequestContext;
}

export const resolvers = {
  Query: {
    getUser: async (
      _parent: unknown,
      args: { id: string },
      context: GraphQLContext,
    ): Promise<{ success: boolean; data: unknown; error: string | null }> => {
      try {
        const userRepository = await context.container.resolve<UserRepository>('userRepository');

        const result = await userRepository.findById(args.id)();

        if (result._tag === 'Right') {
          return {
            success: true,
            data: {
              ...result.right,
              role: result.right.role.toUpperCase(),
            },
            error: null,
          };
        } else {
          const error = result.left;

          if (error._tag === 'UserNotFound') {
            return {
              success: false,
              data: null,
              error: `User not found: ${error.userId}`,
            };
          } else {
            return {
              success: false,
              data: null,
              error: 'Internal server error',
            };
          }
        }
      } catch {
        return {
          success: false,
          data: null,
          error: 'Unexpected error occurred',
        };
      }
    },
  },

  Mutation: {
    createUser: async (
      _parent: unknown,
      args: { input: CreateUserInput },
      context: GraphQLContext,
    ): Promise<{ success: boolean; data: unknown; error: string | null }> => {
      try {
        // Create request-scoped logger
        const requestLogger = new RequestScopedLogger(context.requestContext);

        // Resolve dependencies from scoped container
        const userRepository = await context.container.resolve<UserRepository>('userRepository');
        const emailService = await context.container.resolve<EmailService>('emailService');

        const deps = {
          userRepository,
          emailService,
          logger: requestLogger,
        };

        // Execute use case
        const result = await pipe(createUser(args.input), (useCase) => useCase(deps))();

        if (result._tag === 'Right') {
          return {
            success: true,
            data: {
              ...result.right,
              role: result.right.role.toUpperCase(),
            },
            error: null,
          };
        } else {
          const error = result.left;

          switch (error._tag) {
            case 'ValidationError':
              return {
                success: false,
                data: null,
                error: `Validation failed: ${error.errors.map((e) => e.message).join(', ')}`,
              };
            case 'UserNotFound':
              return {
                success: false,
                data: null,
                error: `User not found: ${error.userId}`,
              };
            case 'DatabaseError':
              return {
                success: false,
                data: null,
                error: `Database error: ${error.message}`,
              };
            case 'EmailServiceError':
              return {
                success: false,
                data: null,
                error: `Email service error: ${error.message}`,
              };
            default:
              return {
                success: false,
                data: null,
                error: 'Internal server error',
              };
          }
        }
      } catch {
        return {
          success: false,
          data: null,
          error: 'Unexpected error occurred',
        };
      }
    },
  },
};
