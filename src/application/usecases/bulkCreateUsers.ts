import * as TE from 'fp-ts/lib/TaskEither';
import * as RTE from 'fp-ts/lib/ReaderTaskEither';
import * as A from 'fp-ts/lib/Array';
import * as E from 'fp-ts/lib/Either';
import { pipe } from 'fp-ts/lib/function';
import { CreateUserInput, BulkCreateUserResult, validateBulkCreateUserInput } from '../../domain/userValidation';
import { createUserEntity } from '../../domain/userFactory';
import { DomainError, ValidationError } from '../../domain/errors';
import { User } from '../../domain/user';
import { UserRepository, EmailService, Logger } from '../ports';

export interface BulkCreateUserDeps {
  userRepository: UserRepository;
  emailService: EmailService;
  logger: Logger;
}

export const bulkCreateUsers = (
  inputs: CreateUserInput[]
): RTE.ReaderTaskEither<BulkCreateUserDeps, DomainError, BulkCreateUserResult> => {
  return pipe(
    RTE.fromEither(validateBulkCreateUserInput(inputs)),
    RTE.chain(validInputs => 
      pipe(
        RTE.ask<BulkCreateUserDeps, DomainError>(),
        RTE.chain(({ userRepository, emailService, logger }) => {
          const userEntitiesResult = validInputs.map(input => createUserEntity(input));
          
          const successfulEntities: User[] = [];
          const failedCreations: Array<{ input: CreateUserInput; errors: ValidationError[] }> = [];
          
          userEntitiesResult.forEach((result, index) => {
            if (E.isRight(result)) {
              successfulEntities.push(result.right);
            } else {
              failedCreations.push({ 
                input: validInputs[index], 
                errors: result.left._tag === 'ValidationError' 
                  ? [...result.left.errors] 
                  : [{ field: 'unknown', message: 'Failed to create user entity' }] 
              });
            }
          });
          
          if (successfulEntities.length === 0) {
            return RTE.right<BulkCreateUserDeps, DomainError, BulkCreateUserResult>({
              successful: [],
              failed: failedCreations
            });
          }
          
          return pipe(
            RTE.fromTaskEither(userRepository.saveBulk(successfulEntities)),
            RTE.map(savedUsers => {
              logger.info(`Successfully created ${savedUsers.length} users in bulk`, { count: savedUsers.length })();
              
              savedUsers.forEach(user => {
                emailService.sendWelcomeEmail(user)();
              });
              
              return {
                successful: savedUsers,
                failed: failedCreations
              };
            })
          );
        })
      )
    )
  );
};
