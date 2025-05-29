import * as TE from 'fp-ts/lib/TaskEither';
import { pipe } from 'fp-ts/lib/function';
import sqlite3 from 'sqlite3';
import { DomainError } from '../../domain/errors';
import { DatabaseConnection } from './connection';

export interface SQLiteConfig {
  filename: string;
  mode?: number;
}

export class SQLiteConnection implements DatabaseConnection {
  private db: sqlite3.Database | null = null;
  private isConnected = false;

  constructor(private config: SQLiteConfig) {}

  async connect(): Promise<void> {
    if (this.isConnected) return;

    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(
        this.config.filename,
        this.config.mode || sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
        (err) => {
          if (err) {
            reject(err);
          } else {
            this.isConnected = true;
            resolve();
          }
        }
      );
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
        _tag: 'DatabaseError' as const,
        message: error instanceof Error ? error.message : 'Unknown database error'
      })
    );
  }

  transaction<T>(fn: (conn: DatabaseConnection) => TE.TaskEither<DomainError, T>): TE.TaskEither<DomainError, T> {
    return pipe(
      TE.tryCatch(
        async () => {
          if (!this.db || !this.isConnected) {
            throw new Error('Database not connected');
          }

          return new Promise<void>((resolve, reject) => {
            this.db!.run('BEGIN TRANSACTION', (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
        },
        (error) => ({
          _tag: 'DatabaseError' as const,
          message: error instanceof Error ? error.message : 'Failed to begin transaction'
        })
      ),
      TE.chain(() => fn(this) as TE.TaskEither<{ _tag: 'DatabaseError'; message: string; }, T>),
      TE.chainFirst((_result) =>
        TE.tryCatch(
          async () => {
            return new Promise<void>((resolve, reject) => {
              this.db!.run('COMMIT', (err) => {
                if (err) reject(err);
                else resolve();
              });
            });
          },
          (error) => ({
            _tag: 'DatabaseError' as const,
            message: error instanceof Error ? error.message : 'Failed to commit transaction'
          })
        )
      ),
      TE.orElse((error) =>
        pipe(
          TE.tryCatch(
            async () => {
              return new Promise<void>((resolve, reject) => {
                this.db!.run('ROLLBACK', (rollbackErr) => {
                  if (rollbackErr) reject(rollbackErr);
                  else resolve();
                });
              });
            },
            () => ({
              _tag: 'DatabaseError' as const,
              message: 'Failed to rollback transaction'
            })
          ),
          TE.chain(() => TE.left(error))
        )
      )
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

  async initializeSchema(): Promise<void> {
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
}

export class SQLiteConnectionPool {
  private connection: SQLiteConnection | null = null;
  private isInitialized = false;

  constructor(private config: SQLiteConfig) {}

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.connection = new SQLiteConnection(this.config);
    await this.connection.connect();
    await this.connection.initializeSchema();
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
