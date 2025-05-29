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
      TE.chain((users) =>
        users.length > 0
          ? TE.right(users[0])
          : TE.left({ _tag: 'UserNotFound' as const, userId: id })
      )
    );

  findByEmail = (email: string): TE.TaskEither<DomainError, User> =>
    pipe(
      this.db.query<User>('SELECT * FROM users WHERE email = ?', [email]),
      TE.chain((users) =>
        users.length > 0
          ? TE.right(users[0])
          : TE.left({ _tag: 'UserNotFound' as const, userId: email })
      )
    );

  save = (user: User): TE.TaskEither<DomainError, User> =>
    pipe(
      this.db.query<User>(
        'INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?) RETURNING *',
        [user.id, user.email, user.name, user.role]
      ),
      TE.chain((users) => {
        return users.length > 0
          ? TE.right(users[0])
          : TE.left({ _tag: 'DatabaseError' as const, message: 'Failed to save user' })
      }
      )
    );
}
