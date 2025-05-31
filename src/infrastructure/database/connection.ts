import * as TE from 'fp-ts/lib/TaskEither';
import sqlite3 from 'sqlite3';
import { DomainError } from '../../domain/errors';

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  maxConnections: number;
}

export interface DatabaseConnection {
  query<T>(sql: string, params?: unknown[]): TE.TaskEither<DomainError, T[]>;
  transaction<T>(fn: (conn: DatabaseConnection) => TE.TaskEither<DomainError, T>): TE.TaskEither<DomainError, T>;
  close(): Promise<void>;
}

// SQLite implementation for testing and development
export class MockDatabaseConnection implements DatabaseConnection {
  private db: sqlite3.Database | null = null;
  private isConnected = false;

  constructor(private config: DatabaseConfig) {}

  async connect(): Promise<void> {
    if (this.isConnected) return;

    return new Promise((resolve, reject) => {
      // Use in-memory SQLite database for mock/testing
      this.db = new sqlite3.Database(':memory:', (err) => {
        if (err) {
          reject(err);
        } else {
          this.isConnected = true;
          this.initializeSchema().then(resolve).catch(reject);
        }
      });
    });
  }

  private async initializeSchema(): Promise<void> {
    if (!this.db || !this.isConnected) {
      throw new Error('Database not connected');
    }

    const createUsersTable = `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    return new Promise((resolve, reject) => {
      this.db!.run(createUsersTable, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  query<T>(sql: string, params?: unknown[]): TE.TaskEither<DomainError, T[]> {
    return TE.tryCatch(
      async () => {
        if (!this.db || !this.isConnected) {
          throw new Error('Database not connected');
        }

        return new Promise<T[]>((resolve, reject) => {
          if (sql.trim().toUpperCase().startsWith('SELECT')) {
            this.db!.all(sql, params || [], (err, rows) => {
              if (err) {
                reject(err);
              } else {
                resolve(rows as T[]);
              }
            });
          } else if (sql.trim().toUpperCase().includes('RETURNING')) {
            this.db!.all(sql, params || [], (err, rows) => {
              if (err) {
                reject(err);
              } else {
                resolve(rows as T[]);
              }
            });
          } else {
            this.db!.run(sql, params || [], function(err) {
              if (err) {
                reject(err);
              } else {
                // For INSERT/UPDATE/DELETE without RETURNING, return affected rows info
                resolve([{ lastID: this.lastID, changes: this.changes } as unknown as T]);
              }
            });
          }
        });
      },
      (error) => ({
        _tag: 'DatabaseError',
        message: error instanceof Error ? error.message : 'Unknown database error',
      }),
    );
  }

  transaction<T>(fn: (conn: DatabaseConnection) => TE.TaskEither<DomainError, T>): TE.TaskEither<DomainError, T> {
    return TE.tryCatch(
      async () => {
        if (!this.db || !this.isConnected) {
          throw new Error('Database not connected');
        }

        // Begin transaction
        await new Promise<void>((resolve, reject) => {
          this.db!.run('BEGIN TRANSACTION', (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        try {
          // Execute the transaction function
          const result = await fn(this)();
          if (result._tag === 'Left') {
            // Rollback on error
            await new Promise<void>((resolve, reject) => {
              this.db!.run('ROLLBACK', (err) => {
                if (err) reject(err);
                else resolve();
              });
            });

            // Handle different error types
            const error = result.left;
            let errorMessage: string;
            switch (error._tag) {
              case 'DatabaseError':
              case 'EmailServiceError':
                errorMessage = error.message;
                break;
              case 'UserNotFound':
                errorMessage = `User not found: ${error.userId}`;
                break;
              case 'InvalidEmail':
                errorMessage = `Invalid email: ${error.email}`;
                break;
              case 'Unauthorized':
                errorMessage = `Unauthorized: ${error.reason}`;
                break;
              case 'ValidationError':
                errorMessage = `Validation error: ${error.errors.map(e => e.message).join(', ')}`;
                break;
              default:
                errorMessage = 'Unknown error';
            }
            throw new Error(errorMessage);
          }

          // Commit on success
          await new Promise<void>((resolve, reject) => {
            this.db!.run('COMMIT', (err) => {
              if (err) reject(err);
              else resolve();
            });
          });

          return result.right;
        } catch (error) {
          // Rollback on any error
          await new Promise<void>((resolve, reject) => {
            this.db!.run('ROLLBACK', (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
          throw error;
        }
      },
      (error) => ({
        _tag: 'DatabaseError',
        message: error instanceof Error ? error.message : 'Transaction failed',
      }),
    );
  }

  async close(): Promise<void> {
    if (this.db && this.isConnected) {
      return new Promise((resolve, reject) => {
        this.db!.close((err) => {
          if (err) {
            reject(err);
          } else {
            this.isConnected = false;
            this.db = null;
            resolve();
          }
        });
      });
    }
  }
}

export class DatabaseConnectionPool {
  private connection: MockDatabaseConnection | null = null;
  private isInitialized = false;

  constructor(private config: DatabaseConfig) {}

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.connection = new MockDatabaseConnection(this.config);
    await this.connection.connect();
    this.isInitialized = true;
  }

  getConnection(): DatabaseConnection {
    if (!this.connection || !this.isInitialized) {
      throw new Error('Database pool not initialized');
    }
    return this.connection;
  }

  async close(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }
    this.isInitialized = false;
  }
}
