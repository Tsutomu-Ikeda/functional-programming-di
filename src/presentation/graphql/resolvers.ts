import { pipe } from 'fp-ts/lib/function';
import * as E from 'fp-ts/lib/Either';
import { createUser } from '../../application/usecases/createUser';
import { bulkCreateUsers } from '../../application/usecases/bulkCreateUsers';
import { ScopedContainer, RequestContext } from '../../infrastructure/di/types';
import { UserRepository, EmailService } from '../../application/ports';
import { RequestScopedLogger } from '../../infrastructure/logging/logger';
import { CreateUserInput } from '../../domain/userValidation';
import { parseUsersFromCSV } from '../../infrastructure/csv/csvParser';

export interface GraphQLContext {
  container: ScopedContainer;
  requestContext: RequestContext;
}

export const resolvers = {
  Query: {
    getUser: async (
      _parent: unknown,
      args: { id: string },
      context: GraphQLContext
    ): Promise<{ success: boolean; data: unknown; error: string | null }> => {
      try {
        const userRepository = await context.container.resolve<UserRepository>('userRepository');

        const result = await userRepository.findById(args.id)();

        if (result._tag === 'Right') {
          return {
            success: true,
            data: {
              ...result.right,
              role: result.right.role.toUpperCase()
            },
            error: null
          };
        } else {
          const error = result.left;

          if (error._tag === 'UserNotFound') {
            return {
              success: false,
              data: null,
              error: `User not found: ${error.userId}`
            };
          } else {
            return {
              success: false,
              data: null,
              error: 'Internal server error'
            };
          }
        }
      } catch {
        return {
          success: false,
          data: null,
          error: 'Unexpected error occurred'
        };
      }
    }
  },

  Mutation: {
    createUser: async (
      _parent: unknown,
      args: { input: CreateUserInput },
      context: GraphQLContext
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
          logger: requestLogger
        };

        // Execute use case
        const result = await pipe(
          createUser(args.input),
          (useCase) => useCase(deps)
        )();

        if (result._tag === 'Right') {
          return {
            success: true,
            data: {
              ...result.right,
              role: result.right.role.toUpperCase()
            },
            error: null
          };
        } else {
          const error = result.left;

          switch (error._tag) {
            case 'ValidationError':
              return {
                success: false,
                data: null,
                error: `Validation failed: ${error.errors.map(e => e.message).join(', ')}`
              };
            case 'UserNotFound':
              return {
                success: false,
                data: null,
                error: `User not found: ${error.userId}`
              };
            case 'DatabaseError':
              return {
                success: false,
                data: null,
                error: `Database error: ${error.message}`
              };
            case 'EmailServiceError':
              return {
                success: false,
                data: null,
                error: `Email service error: ${error.message}`
              };
            default:
              return {
                success: false,
                data: null,
                error: 'Internal server error'
              };
          }
        }
      } catch {
        return {
          success: false,
          data: null,
          error: 'Unexpected error occurred'
        };
      }
    },

    bulkCreateUsers: async (
      _parent: unknown,
      args: { csvContent: string },
      context: GraphQLContext
    ): Promise<{ success: boolean; data: unknown; error: string | null }> => {
      try {
        const parseResult = parseUsersFromCSV(args.csvContent);

        if (E.isLeft(parseResult)) {
          return {
            success: false,
            data: null,
            error: `CSV parsing error: ${parseResult.left._tag === 'CSVParsingError' ? parseResult.left.message : 'Unknown error'}`
          };
        }

        const userInputs = parseResult.right;
        // Create request-scoped logger
        const requestLogger = new RequestScopedLogger(context.requestContext);

        // Resolve dependencies from scoped container
        const userRepository = await context.container.resolve<UserRepository>('userRepository');
        const emailService = await context.container.resolve<EmailService>('emailService');

        const deps = {
          userRepository,
          emailService,
          logger: requestLogger
        };

        // Execute use case
        const result = await pipe(
          bulkCreateUsers(userInputs),
          (useCase) => useCase(deps)
        )();

        if (result._tag === 'Right') {
          const bulkResult = result.right;

          return {
            success: true,
            data: {
              successful: bulkResult.successful.map(user => ({
                ...user,
                role: user.role.toUpperCase()
              })),
              failed: bulkResult.failed
            },
            error: null
          };
        } else {
          const error = result.left;

          switch (error._tag) {
            case 'ValidationError':
              return {
                success: false,
                data: null,
                error: `Validation failed: ${error.errors.map(e => e.message).join(', ')}`
              };
            case 'BulkValidationError':
              return {
                success: false,
                data: {
                  successful: [],
                  failed: error.failedInputs
                },
                error: 'Validation failed for some users'
              };
            case 'CSVParsingError':
              return {
                success: false,
                data: null,
                error: `CSV parsing error: ${error.message}`
              };
            case 'DatabaseError':
              return {
                success: false,
                data: null,
                error: `Database error: ${error.message}`
              };
            case 'EmailServiceError':
              return {
                success: false,
                data: null,
                error: `Email service error: ${error.message}`
              };
            default:
              return {
                success: false,
                data: null,
                error: 'Internal server error'
              };
          }
        }
      } catch {
        return {
          success: false,
          data: null,
          error: 'Unexpected error occurred'
        };
      }
    }
  }
};
