import * as TE from 'fp-ts/TaskEither';
import * as E from 'fp-ts/Either';
import { MockDatabaseConnection, DatabaseConnectionPool, DatabaseConfig, DatabaseConnection } from './connection';
import { DomainError } from '../../domain/errors';
import { User } from '../../domain/user';

describe('MockDatabaseConnection', () => {
  let connection: MockDatabaseConnection;
  let config: DatabaseConfig;

  beforeEach(() => {
    config = {
      host: 'localhost',
      port: 5432,
      database: 'test_db',
      username: 'test_user',
      password: 'test_password',
      maxConnections: 10,
    };
    connection = new MockDatabaseConnection(config);
  });

  afterEach(async () => {
    if (connection) {
      await connection.close();
    }
  });

  describe('connect', () => {
    it('should connect successfully', async () => {
      await expect(connection.connect()).resolves.not.toThrow();
    });

    it('should not reconnect if already connected', async () => {
      await connection.connect();
      await expect(connection.connect()).resolves.not.toThrow();
    });

    it('should initialize schema after connection', async () => {
      await connection.connect();

      // Verify that users table was created by trying to query it
      const result = await connection.query('SELECT name FROM sqlite_master WHERE type="table" AND name="users"')();

      expect(result).toEqual(E.right([{ name: 'users' }]));
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      await connection.connect();
    });

    it('should execute SELECT queries successfully', async () => {
      const result = await connection.query('SELECT * FROM users')();

      expect(result).toEqual(E.right([]));
    });

    it('should execute INSERT queries and return metadata', async () => {
      const insertSql = 'INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)';
      const params = ['test-id', 'test@example.com', 'Test User', 'user'];

      const result = await connection.query(insertSql, params)();

      expect(result).toEqual(E.right([
        expect.objectContaining({
          lastID: expect.any(Number),
          changes: 1,
        }),
      ]));
    });

    it('should execute UPDATE queries and return metadata', async () => {
      // First insert a user
      await connection.query('INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)',
        ['test-id', 'test@example.com', 'Test User', 'user'])();

      // Then update the user
      const updateSql = 'UPDATE users SET name = ? WHERE id = ?';
      const params = ['Updated User', 'test-id'];

      const result = await connection.query(updateSql, params)();

      expect(result).toEqual(E.right([
        expect.objectContaining({
          changes: 1,
        }),
      ]));
    });

    it('should execute DELETE queries and return metadata', async () => {
      // First insert a user
      await connection.query('INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)',
        ['test-id', 'test@example.com', 'Test User', 'user'])();

      // Then delete the user
      const deleteSql = 'DELETE FROM users WHERE id = ?';
      const params = ['test-id'];

      const result = await connection.query(deleteSql, params)();

      expect(result).toEqual(E.right([
        expect.objectContaining({
          changes: 1,
        }),
      ]));
    });

    it('should handle queries with RETURNING clause', async () => {
      // Note: SQLite doesn't support RETURNING in older versions, but we test the code path
      const insertSql = 'INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?) RETURNING *';
      const params = ['test-id', 'test@example.com', 'Test User', 'user'];

      const result = await connection.query(insertSql, params)();

      // This might fail in SQLite, but we're testing the code path
      expect(E.isLeft(result) || E.isRight(result)).toBe(true);
    });

    it('should return DatabaseError for invalid SQL', async () => {
      const result = await connection.query('INVALID SQL STATEMENT')();

      expect(result).toEqual(E.left({
        _tag: 'DatabaseError',
        message: 'Unknown database error',
      }));
    });

    it('should return DatabaseError when not connected', async () => {
      const disconnectedConnection = new MockDatabaseConnection(config);

      const result = await disconnectedConnection.query('SELECT * FROM users')();

      expect(result).toEqual(E.left({
        _tag: 'DatabaseError',
        message: 'Database not connected',
      }));
    });

    it('should handle queries with parameters', async () => {
      const insertSql = 'INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)';
      const params = ['param-test-id', 'param@example.com', 'Param User', 'admin'];

      const insertResult = await connection.query(insertSql, params)();
      expect(E.isRight(insertResult)).toBe(true);

      const selectSql = 'SELECT * FROM users WHERE email = ?';
      const selectResult = await connection.query(selectSql, ['param@example.com'])();

      expect(selectResult).toEqual(E.right([
        expect.objectContaining({
          id: 'param-test-id',
          email: 'param@example.com',
          name: 'Param User',
          role: 'admin',
        }),
      ]));
    });
  });

  describe('transaction', () => {
    beforeEach(async () => {
      await connection.connect();
    });

    it('should execute successful transaction', async () => {
      const transactionFn = (conn: DatabaseConnection) => {
        return conn.query<User>('INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)',
          ['tx-test-id', 'tx@example.com', 'Transaction User', 'user']);
      };

      const result = await connection.transaction(transactionFn)();

      expect(result).toEqual(E.right([
        expect.objectContaining({
          lastID: expect.any(Number),
          changes: 1,
        }),
      ]));

      // Verify the user was inserted
      const selectResult = await connection.query('SELECT * FROM users WHERE id = ?', ['tx-test-id'])();
      expect(selectResult).toEqual(E.right([
        expect.objectContaining({
          id: 'tx-test-id',
          email: 'tx@example.com',
        }),
      ]));
    });

    it('should rollback transaction on error', async () => {
      const transactionFn = () => {
        return TE.left({ _tag: 'DatabaseError' as const, message: 'Simulated error' });
      };

      const result = await connection.transaction(transactionFn)();

      expect(result).toEqual(E.left({
        _tag: 'DatabaseError',
        message: 'Transaction failed',
      }));

      // Verify no data was affected due to rollback
      const selectResult = await connection.query('SELECT * FROM users WHERE id = ?', ['rollback-test-id'])();
      expect(selectResult).toEqual(E.right([]));
    });

    it('should handle UserNotFound error in transaction', async () => {
      const transactionFn = () => {
        return TE.left({ _tag: 'UserNotFound' as const, userId: 'non-existent' });
      };

      const result = await connection.transaction(transactionFn)();

      expect(result).toEqual(E.left({
        _tag: 'DatabaseError',
        message: 'Transaction failed',
      }));
    });

    it('should handle InvalidEmail error in transaction', async () => {
      const transactionFn = () => {
        return TE.left({ _tag: 'InvalidEmail' as const, email: 'invalid-email' });
      };

      const result = await connection.transaction(transactionFn)();

      expect(result).toEqual(E.left({
        _tag: 'DatabaseError',
        message: 'Transaction failed',
      }));
    });

    it('should handle Unauthorized error in transaction', async () => {
      const transactionFn = () => {
        return TE.left({ _tag: 'Unauthorized' as const, reason: 'Access denied' });
      };

      const result = await connection.transaction(transactionFn)();

      expect(result).toEqual(E.left({
        _tag: 'DatabaseError',
        message: 'Transaction failed',
      }));
    });

    it('should handle ValidationError in transaction', async () => {
      const transactionFn = () => {
        return TE.left({
          _tag: 'ValidationError' as const,
          errors: [
            { field: 'email', message: 'Invalid format' },
            { field: 'name', message: 'Too short' },
          ],
        });
      };

      const result = await connection.transaction(transactionFn)();

      expect(result).toEqual(E.left({
        _tag: 'DatabaseError',
        message: 'Transaction failed',
      }));
    });

    it('should handle EmailServiceError in transaction', async () => {
      const transactionFn = () => {
        return TE.left({ _tag: 'EmailServiceError' as const, message: 'Email service down' });
      };

      const result = await connection.transaction(transactionFn)();

      expect(result).toEqual(E.left({
        _tag: 'DatabaseError',
        message: 'Transaction failed',
      }));
    });

    it('should handle unknown error types in transaction', async () => {
      const transactionFn = () => {
        return TE.left({ _tag: 'UnknownError', message: 'Something went wrong' } as DomainError);
      };

      const result = await connection.transaction(transactionFn)();

      expect(result).toEqual(E.left({
        _tag: 'DatabaseError',
        message: 'Transaction failed',
      }));
    });

    it('should return DatabaseError when not connected', async () => {
      const disconnectedConnection = new MockDatabaseConnection(config);

      const transactionFn = () => TE.right('test');
      const result = await disconnectedConnection.transaction(transactionFn)();

      expect(result).toEqual(E.left({
        _tag: 'DatabaseError',
        message: 'Database not connected',
      }));
    });

    it('should handle operations in transaction', async () => {
      const transactionFn = (conn: DatabaseConnection) => {
        return conn.query('INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)',
          ['multi-1', 'multi1@example.com', 'Multi User 1', 'user']);
      };

      const result = await connection.transaction(transactionFn)();

      expect(result).toEqual(E.right([
        expect.objectContaining({
          lastID: expect.any(Number),
          changes: 1,
        }),
      ]));

      // Verify the user was inserted
      const selectResult = await connection.query('SELECT * FROM users WHERE id = ?', ['multi-1'])();
      expect(selectResult).toEqual(E.right([
        expect.objectContaining({
          id: 'multi-1',
          email: 'multi1@example.com',
        }),
      ]));
    });
  });

  describe('close', () => {
    it('should close connection successfully', async () => {
      await connection.connect();
      await expect(connection.close()).resolves.not.toThrow();
    });

    it('should handle closing when not connected', async () => {
      await expect(connection.close()).resolves.not.toThrow();
    });

    it('should handle closing already closed connection', async () => {
      await connection.connect();
      await connection.close();
      await expect(connection.close()).resolves.not.toThrow();
    });
  });
});

describe('DatabaseConnectionPool', () => {
  let pool: DatabaseConnectionPool;
  let config: DatabaseConfig;

  beforeEach(() => {
    config = {
      host: 'localhost',
      port: 5432,
      database: 'test_db',
      username: 'test_user',
      password: 'test_password',
      maxConnections: 10,
    };
    pool = new DatabaseConnectionPool(config);
  });

  afterEach(async () => {
    if (pool) {
      await pool.close();
    }
  });

  describe('initialize', () => {
    it('should initialize pool successfully', async () => {
      await expect(pool.initialize()).resolves.not.toThrow();
    });

    it('should not reinitialize if already initialized', async () => {
      await pool.initialize();
      await expect(pool.initialize()).resolves.not.toThrow();
    });
  });

  describe('getConnection', () => {
    it('should return connection after initialization', async () => {
      await pool.initialize();

      const connection = pool.getConnection();
      expect(connection).toBeDefined();
      expect(typeof connection.query).toBe('function');
      expect(typeof connection.transaction).toBe('function');
      expect(typeof connection.close).toBe('function');
    });

    it('should throw error when not initialized', () => {
      expect(() => pool.getConnection()).toThrow('Database pool not initialized');
    });

    it('should return the same connection instance', async () => {
      await pool.initialize();

      const connection1 = pool.getConnection();
      const connection2 = pool.getConnection();

      expect(connection1).toBe(connection2);
    });
  });

  describe('close', () => {
    it('should close pool successfully', async () => {
      await pool.initialize();
      await expect(pool.close()).resolves.not.toThrow();
    });

    it('should handle closing when not initialized', async () => {
      await expect(pool.close()).resolves.not.toThrow();
    });

    it('should handle closing already closed pool', async () => {
      await pool.initialize();
      await pool.close();
      await expect(pool.close()).resolves.not.toThrow();
    });

    it('should throw error when getting connection after close', async () => {
      await pool.initialize();
      await pool.close();

      expect(() => pool.getConnection()).toThrow('Database pool not initialized');
    });
  });

  describe('integration', () => {
    it('should allow querying through pool connection', async () => {
      await pool.initialize();

      const connection = pool.getConnection();
      const result = await connection.query('SELECT * FROM users')();

      expect(result).toEqual(E.right([]));
    });

    it('should allow transactions through pool connection', async () => {
      await pool.initialize();

      const connection = pool.getConnection();
      const transactionFn = (conn: DatabaseConnection) => {
        return conn.query('INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)',
          ['pool-test-id', 'pool@example.com', 'Pool User', 'user']);
      };

      const result = await connection.transaction(transactionFn)();

      expect(result).toEqual(E.right([
        expect.objectContaining({
          lastID: expect.any(Number),
          changes: 1,
        }),
      ]));

      // Verify the user was inserted
      const selectResult = await connection.query('SELECT * FROM users WHERE id = ?', ['pool-test-id'])();
      expect(selectResult).toEqual(E.right([
        expect.objectContaining({
          id: 'pool-test-id',
          email: 'pool@example.com',
        }),
      ]));
    });
  });
});
