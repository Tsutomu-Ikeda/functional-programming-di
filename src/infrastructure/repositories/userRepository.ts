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
          : TE.left({ _tag: 'UserNotFound' as const, userId: id })
      )
    );

  findByEmail = (email: string): TE.TaskEither<DomainError, User> =>
    pipe(
      this.db.query<User>('SELECT * FROM users WHERE email = ?', [email]),
      TE.flatMap((users) =>
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
      TE.flatMap((users) => {
        return users.length > 0
          ? TE.right(users[0])
          : TE.left({ _tag: 'DatabaseError' as const, message: 'Failed to save user' });
      }
      )
    );

  saveBulk = (users: User[]): TE.TaskEither<DomainError, User[]> => {
    if (users.length === 0) {
      return TE.right([]);
    }

    return this.db.transaction<User[]>((conn) => {
      const insertPromises = users.map(user => 
        conn.query<User>(
          'INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?) RETURNING *',
          [user.id, user.email, user.name, user.role]
        )
      );

      return pipe(
        TE.sequenceArray(insertPromises),
        TE.map(results => results.flatMap(r => r)),
        TE.chain(savedUsers => {
          if (savedUsers.length === users.length) {
            return TE.right(savedUsers);
          } else {
            return TE.left({ 
              _tag: 'DatabaseError' as const, 
              message: 'Failed to save all users in bulk operation' 
            });
          }
        })
      );
    });
  };
}
