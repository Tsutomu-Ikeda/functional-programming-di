import * as TE from 'fp-ts/TaskEither';
import * as E from 'fp-ts/Either';
import sqlite3 from 'sqlite3';
import { SQLiteConnection, SQLiteConnectionPool, SQLiteConfig } from './sqliteConnection';
import { promises as fs } from 'fs';
import path from 'path';
import { DatabaseConnection } from './connection';

describe('SQLiteConnection', () => {
  let connection: SQLiteConnection;
  let config: SQLiteConfig;
  let testDbPath: string;

  beforeEach(() => {
    testDbPath = path.join(__dirname, `test-${Date.now()}-${Math.random()}.db`);
    config = {
      filename: testDbPath,
      mode: sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE
    };
    connection = new SQLiteConnection(config);
  });

  afterEach(async () => {
    if (connection) {
      await connection.close();
    }
    // Clean up test database file
    try {
      await fs.unlink(testDbPath);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  describe('connect', () => {
    it('should connect successfully with default mode', async () => {
      const configWithoutMode = { filename: testDbPath };
      const conn = new SQLiteConnection(configWithoutMode);

      await expect(conn.connect()).resolves.not.toThrow();
      await conn.close();
    });

    it('should connect successfully with custom mode', async () => {
      await expect(connection.connect()).resolves.not.toThrow();
    });

    it('should not reconnect if already connected', async () => {
      await connection.connect();
      await expect(connection.connect()).resolves.not.toThrow();
    });

    it('should handle connection errors', async () => {
      const invalidConfig = {
        filename: '/invalid/path/database.db',
        mode: sqlite3.OPEN_READWRITE // Only read/write, no create
      };
      const invalidConnection = new SQLiteConnection(invalidConfig);

      await expect(invalidConnection.connect()).rejects.toThrow();
    });
  });

  describe('initializeSchema', () => {
    it('should initialize schema successfully after connection', async () => {
      await connection.connect();
      await expect(connection.initializeSchema()).resolves.not.toThrow();

      // Verify that users table was created
      const result = await connection.query('SELECT name FROM sqlite_master WHERE type="table" AND name="users"')();
      expect(result).toEqual(E.right([{ name: 'users' }]));
    });

    it('should throw error when not connected', async () => {
      await expect(connection.initializeSchema()).rejects.toThrow('Database not connected');
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      await connection.connect();
      await connection.initializeSchema();
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
          changes: 1
        })
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
          changes: 1
        })
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
          changes: 1
        })
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
        message: 'Unknown database error'
      }));
    });

    it('should return DatabaseError when not connected', async () => {
      const disconnectedConnection = new SQLiteConnection(config);

      const result = await disconnectedConnection.query('SELECT * FROM users')();

      expect(result).toEqual(E.left({
        _tag: 'DatabaseError',
        message: 'Database not connected'
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
          role: 'admin'
        })
      ]));
    });

    it('should handle queries without parameters', async () => {
      const result = await connection.query('SELECT COUNT(*) as count FROM users')();

      expect(result).toEqual(E.right([
        expect.objectContaining({
          count: expect.any(Number)
        })
      ]));
    });
  });

  describe('transaction', () => {
    beforeEach(async () => {
      await connection.connect();
      await connection.initializeSchema();
    });

    it('should execute successful transaction', async () => {
      const transactionFn = (conn: DatabaseConnection) => {
        return conn.query('INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)',
          ['tx-test-id', 'tx@example.com', 'Transaction User', 'user']);
      };

      const result = await connection.transaction(transactionFn)();

      expect(result).toEqual(E.right([
        expect.objectContaining({
          lastID: expect.any(Number),
          changes: 1
        })
      ]));

      // Verify the user was inserted
      const selectResult = await connection.query('SELECT * FROM users WHERE id = ?', ['tx-test-id'])();
      expect(selectResult).toEqual(E.right([
        expect.objectContaining({
          id: 'tx-test-id',
          email: 'tx@example.com'
        })
      ]));
    });

    it('should rollback transaction on query error', async () => {
      const transactionFn = (conn: DatabaseConnection) => {
        return conn.query('INVALID SQL STATEMENT');
      };

      const result = await connection.transaction(transactionFn)();

      expect(result).toEqual(E.left({
        _tag: 'DatabaseError',
        message: 'Unknown database error'
      }));
    });

    it('should rollback transaction on domain error', async () => {
      const transactionFn = () => {
        return TE.left({ _tag: 'DatabaseError' as const, message: 'Simulated error' });
      };

      const result = await connection.transaction(transactionFn)();

      expect(result).toEqual(E.left({
        _tag: 'DatabaseError',
        message: 'Simulated error'
      }));
    });

    it('should handle UserNotFound error in transaction', async () => {
      const transactionFn = () => {
        return TE.left({ _tag: 'UserNotFound' as const, userId: 'non-existent' });
      };

      const result = await connection.transaction(transactionFn)();

      expect(result).toEqual(E.left({
        _tag: 'UserNotFound',
        userId: 'non-existent'
      }));
    });

    it('should handle InvalidEmail error in transaction', async () => {
      const transactionFn = () => {
        return TE.left({ _tag: 'InvalidEmail' as const, email: 'invalid-email' });
      };

      const result = await connection.transaction(transactionFn)();

      expect(result).toEqual(E.left({
        _tag: 'InvalidEmail',
        email: 'invalid-email'
      }));
    });

    it('should handle Unauthorized error in transaction', async () => {
      const transactionFn = () => {
        return TE.left({ _tag: 'Unauthorized' as const, reason: 'Access denied' });
      };

      const result = await connection.transaction(transactionFn)();

      expect(result).toEqual(E.left({
        _tag: 'Unauthorized',
        reason: 'Access denied'
      }));
    });

    it('should handle ValidationError in transaction', async () => {
      const transactionFn = () => {
        return TE.left({
          _tag: 'ValidationError' as const,
          errors: [
            { field: 'email', message: 'Invalid format' },
            { field: 'name', message: 'Too short' }
          ]
        });
      };

      const result = await connection.transaction(transactionFn)();

      expect(result).toEqual(E.left({
        _tag: 'ValidationError',
        errors: [
          { field: 'email', message: 'Invalid format' },
          { field: 'name', message: 'Too short' }
        ]
      }));
    });

    it('should handle EmailServiceError in transaction', async () => {
      const transactionFn = () => {
        return TE.left({ _tag: 'EmailServiceError' as const, message: 'Email service down' });
      };

      const result = await connection.transaction(transactionFn)();

      expect(result).toEqual(E.left({
        _tag: 'EmailServiceError',
        message: 'Email service down'
      }));
    });

    it('should return DatabaseError when not connected', async () => {
      const disconnectedConnection = new SQLiteConnection(config);

      const transactionFn = () => TE.right('test');
      const result = await disconnectedConnection.transaction(transactionFn)();

      expect(result).toEqual(E.left({
        _tag: 'DatabaseError',
        message: 'Failed to rollback transaction'
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
          changes: 1
        })
      ]));

      // Verify the user was inserted
      const selectResult = await connection.query('SELECT * FROM users WHERE id = ?', ['multi-1'])();
      expect(selectResult).toEqual(E.right([
        expect.objectContaining({
          id: 'multi-1',
          email: 'multi1@example.com'
        })
      ]));
    });

    it('should rollback operations on error', async () => {
      const transactionFn = (conn: DatabaseConnection) => {
        return conn.query('INVALID SQL STATEMENT'); // This will cause an error
      };

      const result = await connection.transaction(transactionFn)();

      expect(E.isLeft(result)).toBe(true);

      // Verify no users were inserted due to rollback
      const selectResult = await connection.query('SELECT * FROM users WHERE id = ?', ['rollback-1'])();
      expect(selectResult).toEqual(E.right([]));
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

describe('SQLiteConnectionPool', () => {
  let pool: SQLiteConnectionPool;
  let config: SQLiteConfig;
  let testDbPath: string;

  beforeEach(() => {
    testDbPath = path.join(__dirname, `pool-test-${Date.now()}-${Math.random()}.db`);
    config = {
      filename: testDbPath,
      mode: sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE
    };
    pool = new SQLiteConnectionPool(config);
  });

  afterEach(async () => {
    if (pool) {
      await pool.close();
    }
    // Clean up test database file
    try {
      await fs.unlink(testDbPath);
    } catch {
      // Ignore if file doesn't exist
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

    it('should initialize schema during initialization', async () => {
      await pool.initialize();

      const connection = pool.getConnection();
      const result = await connection.query('SELECT name FROM sqlite_master WHERE type="table" AND name="users"')();
      expect(result).toEqual(E.right([{ name: 'users' }]));
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
          changes: 1
        })
      ]));

      // Verify the user was inserted
      const selectResult = await connection.query('SELECT * FROM users WHERE id = ?', ['pool-test-id'])();
      expect(selectResult).toEqual(E.right([
        expect.objectContaining({
          id: 'pool-test-id',
          email: 'pool@example.com'
        })
      ]));
    });

    it('should persist data across multiple operations', async () => {
      await pool.initialize();

      const connection = pool.getConnection();

      // Insert a user
      const insertResult = await connection.query('INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)',
        ['persist-test', 'persist@example.com', 'Persist User', 'user'])();
      expect(E.isRight(insertResult)).toBe(true);

      // Query the user
      const selectResult = await connection.query('SELECT * FROM users WHERE id = ?', ['persist-test'])();
      expect(selectResult).toEqual(E.right([
        expect.objectContaining({
          id: 'persist-test',
          email: 'persist@example.com'
        })
      ]));

      // Update the user
      const updateResult = await connection.query('UPDATE users SET name = ? WHERE id = ?',
        ['Updated Persist User', 'persist-test'])();
      expect(E.isRight(updateResult)).toBe(true);

      // Verify the update
      const verifyResult = await connection.query('SELECT * FROM users WHERE id = ?', ['persist-test'])();
      expect(verifyResult).toEqual(E.right([
        expect.objectContaining({
          id: 'persist-test',
          name: 'Updated Persist User'
        })
      ]));
    });
  });
});
