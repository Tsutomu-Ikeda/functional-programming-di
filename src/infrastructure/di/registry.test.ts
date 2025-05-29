import { registerServices, createDefaultConfig, AppConfig } from './registry';
import { createContainer } from './container';
import { DIContainer } from './types';

// Mock the dependencies
jest.mock('../database/connection');
jest.mock('../repositories/userRepository');
jest.mock('../services/emailService');
jest.mock('../logging/logger');

describe('registry', () => {
  let container: DIContainer;
  let config: AppConfig;

  beforeEach(() => {
    container = createContainer();
    config = createDefaultConfig();
  });

  describe('registerServices', () => {
    it('should register all services successfully', async () => {
      const registerSpy = jest.spyOn(container, 'register');

      await registerServices(container, config);

      expect(registerSpy).toHaveBeenCalledWith('databasePool', expect.objectContaining({
        lifecycle: 'singleton'
      }));
      expect(registerSpy).toHaveBeenCalledWith('userRepository', expect.objectContaining({
        lifecycle: 'scoped'
      }));
      expect(registerSpy).toHaveBeenCalledWith('emailService', expect.objectContaining({
        lifecycle: 'singleton'
      }));
      expect(registerSpy).toHaveBeenCalledWith('appLogger', expect.objectContaining({
        lifecycle: 'singleton'
      }));
      expect(registerSpy).toHaveBeenCalledWith('requestLogger', expect.objectContaining({
        lifecycle: 'scoped'
      }));
    });

    it('should register database pool as singleton', async () => {
      const registerSpy = jest.spyOn(container, 'register');

      await registerServices(container, config);

      const databasePoolCall = registerSpy.mock.calls.find(call => call[0] === 'databasePool');
      expect(databasePoolCall).toBeDefined();
      expect(databasePoolCall![1].lifecycle).toBe('singleton');
    });

    it('should register user repository as scoped', async () => {
      const registerSpy = jest.spyOn(container, 'register');

      await registerServices(container, config);

      const userRepositoryCall = registerSpy.mock.calls.find(call => call[0] === 'userRepository');
      expect(userRepositoryCall).toBeDefined();
      expect(userRepositoryCall![1].lifecycle).toBe('scoped');
    });

    it('should register email service as singleton', async () => {
      const registerSpy = jest.spyOn(container, 'register');

      await registerServices(container, config);

      const emailServiceCall = registerSpy.mock.calls.find(call => call[0] === 'emailService');
      expect(emailServiceCall).toBeDefined();
      expect(emailServiceCall![1].lifecycle).toBe('singleton');
    });

    it('should register app logger as singleton', async () => {
      const registerSpy = jest.spyOn(container, 'register');

      await registerServices(container, config);

      const appLoggerCall = registerSpy.mock.calls.find(call => call[0] === 'appLogger');
      expect(appLoggerCall).toBeDefined();
      expect(appLoggerCall![1].lifecycle).toBe('singleton');
    });

    it('should register request logger as scoped with error factory', async () => {
      const registerSpy = jest.spyOn(container, 'register');

      await registerServices(container, config);

      const requestLoggerCall = registerSpy.mock.calls.find(call => call[0] === 'requestLogger');
      expect(requestLoggerCall).toBeDefined();
      expect(requestLoggerCall![1].lifecycle).toBe('scoped');

      // Test that the factory throws an error as expected
      await expect(requestLoggerCall![1].factory()).rejects.toThrow('Request logger should be created in scoped container');
    });
  });

  describe('createDefaultConfig', () => {
    it('should create default config with environment variables', () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        DB_HOST: 'test-host',
        DB_PORT: '5433',
        DB_NAME: 'test_db',
        DB_USER: 'test_user',
        DB_PASSWORD: 'test_password',
        DB_MAX_CONNECTIONS: '20',
        SMTP_HOST: 'smtp.test.com',
        SMTP_PORT: '465',
        SMTP_USER: 'smtp_user',
        SMTP_PASSWORD: 'smtp_password',
        FROM_EMAIL: 'test@test.com',
        LOG_LEVEL: 'debug',
        LOG_FORMAT: 'text'
      };

      const config = createDefaultConfig();

      expect(config).toEqual({
        database: {
          host: 'test-host',
          port: 5433,
          database: 'test_db',
          username: 'test_user',
          password: 'test_password',
          maxConnections: 20
        },
        email: {
          smtpHost: 'smtp.test.com',
          smtpPort: 465,
          username: 'smtp_user',
          password: 'smtp_password',
          fromEmail: 'test@test.com'
        },
        logger: {
          level: 'debug',
          format: 'text'
        }
      });

      process.env = originalEnv;
    });

    it('should create default config with fallback values', () => {
      const originalEnv = process.env;
      process.env = {};

      const config = createDefaultConfig();

      expect(config).toEqual({
        database: {
          host: 'localhost',
          port: 5432,
          database: 'app_db',
          username: 'user',
          password: 'password',
          maxConnections: 10
        },
        email: {
          smtpHost: 'localhost',
          smtpPort: 587,
          username: 'user',
          password: 'password',
          fromEmail: 'noreply@example.com'
        },
        logger: {
          level: 'info',
          format: 'json'
        }
      });

      process.env = originalEnv;
    });

    it('should handle invalid port numbers gracefully', () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        DB_PORT: 'invalid',
        SMTP_PORT: 'invalid',
        DB_MAX_CONNECTIONS: 'invalid'
      };

      const config = createDefaultConfig();

      expect(config.database.port).toBeNaN();
      expect(config.email.smtpPort).toBeNaN();
      expect(config.database.maxConnections).toBeNaN();

      process.env = originalEnv;
    });
  });
});
