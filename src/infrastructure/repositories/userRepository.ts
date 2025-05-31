import * as TE from 'fp-ts/lib/TaskEither';
import { pipe } from 'fp-ts/lib/function';
import { User } from '../../domain/user';
import { DomainError } from '../../domain/errors';
import { UserRepository } from '../../application/ports';
import { DatabaseConnection } from '../database/connection';

export class DatabaseUserRepository implements UserRepository {
  constructor(private db: DatabaseConnection) { }

  findById = (id: string): TE.TaskEither<DomainError, User> =>
    pipe(
      this.db.query<User>('SELECT * FROM users WHERE id = ?', [id]),
      TE.flatMap((users) =>
        users.length > 0
          ? TE.right(users[0])
          : TE.left<DomainError>({ _tag: 'UserNotFound', userId: id }),
      ),
    );

  findByEmail = (email: string): TE.TaskEither<DomainError, User> =>
    pipe(
      this.db.query<User>('SELECT * FROM users WHERE email = ?', [email]),
      TE.flatMap((users) =>
        users.length > 0
          ? TE.right(users[0])
          : TE.left<DomainError>({ _tag: 'UserNotFound', userId: email }),
      ),
    );

  save = (user: User): TE.TaskEither<DomainError, User> =>
    pipe(
      this.db.query<User>(
        'INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?) RETURNING *',
        [user.id, user.email, user.name, user.role],
      ),
      TE.flatMap((users) => {
        return users.length > 0
          ? TE.right(users[0])
          : TE.left<DomainError>({ _tag: 'DatabaseError', message: 'Failed to save user' });
      },
      ),
    );
}
