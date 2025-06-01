import type { EmailService, Logger, UserRepository } from '../../application/ports';
import type { DatabaseConfig } from '../database/connection';
import { DatabaseConnectionPool } from '../database/connection';
import type { LoggerConfig } from '../logging/logger';
import { SingletonLogger } from '../logging/logger';
import { DatabaseUserRepository } from '../repositories/userRepository';
import type { EmailConfig } from '../services/emailService';
import { MockEmailService } from '../services/emailService';
import type { DIContainer } from './types';

export interface AppConfig {
  database: DatabaseConfig;
  email: EmailConfig;
  logger: LoggerConfig;
}

export const registerServices = async (container: DIContainer, config: AppConfig): Promise<void> => {
  // Database connection pool (singleton)
  container.register<DatabaseConnectionPool>('databasePool', {
    factory: async () => {
      const pool = new DatabaseConnectionPool(config.database);
      await pool.initialize();
      return pool;
    },
    lifecycle: 'singleton',
  });

  // User repository (scoped - new instance per request)
  container.register<UserRepository>('userRepository', {
    factory: async () => {
      const pool = await container.resolve<DatabaseConnectionPool>('databasePool');
      const connection = pool.getConnection();
      return new DatabaseUserRepository(connection);
    },
    lifecycle: 'scoped',
  });

  // Email service (singleton)
  container.register<EmailService>('emailService', {
    factory: async () => new MockEmailService(config.email),
    lifecycle: 'singleton',
  });

  // Application logger (singleton)
  container.register<Logger>('appLogger', {
    factory: async () => new SingletonLogger(config.logger),
    lifecycle: 'singleton',
  });

  // Request-scoped logger (scoped - new instance per request with request context)
  container.register<Logger>('requestLogger', {
    factory: async () => {
      // This will be overridden in the scoped container with actual request context
      throw new Error('Request logger should be created in scoped container');
    },
    lifecycle: 'scoped',
  });
};

export const createDefaultConfig = (): AppConfig => ({
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'app_db',
    username: process.env.DB_USER || 'user',
    password: process.env.DB_PASSWORD || 'password',
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '10'),
  },
  email: {
    smtpHost: process.env.SMTP_HOST || 'localhost',
    smtpPort: parseInt(process.env.SMTP_PORT || '587'),
    username: process.env.SMTP_USER || 'user',
    password: process.env.SMTP_PASSWORD || 'password',
    fromEmail: process.env.FROM_EMAIL || 'noreply@example.com',
  },
  logger: {
    level: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
    format: (process.env.LOG_FORMAT as 'json' | 'text') || 'json',
  },
});
