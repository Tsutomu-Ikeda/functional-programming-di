import * as E from 'fp-ts/lib/Either';
import { MockEmailService, RealEmailService, EmailConfig } from './emailService';
import { User } from '../../domain/user';

describe('EmailService', () => {
  const mockConfig: EmailConfig = {
    smtpHost: 'smtp.test.com',
    smtpPort: 587,
    username: 'test@example.com',
    password: 'password',
    fromEmail: 'noreply@example.com'
  };

  const testUser: User = {
    id: '1',
    email: 'user@example.com',
    name: 'Test User',
    role: 'user'
  };

  describe('MockEmailService', () => {
    let emailService: MockEmailService;
    let consoleSpy: jest.SpyInstance;

    beforeEach(() => {
      emailService = new MockEmailService(mockConfig);
      consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      jest.spyOn(Math, 'random').mockReturnValue(0.5); // Ensure no random failures
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should send welcome email successfully', async () => {
      const result = await emailService.sendWelcomeEmail(testUser)();

      expect(result._tag).toBe('Right');
      expect(consoleSpy).toHaveBeenCalledWith(`Sending welcome email to ${testUser.email} for user ${testUser.name}`);
    });

    it('should handle email sending failure', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.05); // Force failure

      const result = await emailService.sendWelcomeEmail(testUser)();

      expect(result).toEqual(E.left({
        _tag: 'EmailServiceError',
        message: 'SMTP server unavailable'
      }));
    });

    it('should handle unknown errors', async () => {
      // Mock setTimeout to throw an error
      jest.spyOn(global, 'setTimeout').mockImplementation(() => {
        throw 'Unknown error';
      });

      const result = await emailService.sendWelcomeEmail(testUser)();

      expect(result).toEqual(E.left({
        _tag: 'EmailServiceError',
        message: 'Unknown email service error'
      }));
    });

    it('should simulate email sending delay', async () => {
      const startTime = Date.now();
      await emailService.sendWelcomeEmail(testUser)();
      const endTime = Date.now();

      expect(endTime - startTime).toBeGreaterThanOrEqual(100);
    });
  });

  describe('RealEmailService', () => {
    let emailService: RealEmailService;
    let consoleSpy: jest.SpyInstance;

    beforeEach(() => {
      emailService = new RealEmailService(mockConfig);
      consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should send welcome email successfully', async () => {
      const result = await emailService.sendWelcomeEmail(testUser)();

      expect(result._tag).toBe('Right');
      expect(consoleSpy).toHaveBeenCalledWith('Sending email:', expect.objectContaining({
        to: testUser.email,
        from: mockConfig.fromEmail,
        subject: 'Welcome to our platform!',
        html: expect.stringContaining(`Welcome ${testUser.name}!`)
      }));
    });

    it('should include user details in email content', async () => {
      await emailService.sendWelcomeEmail(testUser)();

      const emailContent = consoleSpy.mock.calls[0][1];
      expect(emailContent.to).toBe(testUser.email);
      expect(emailContent.from).toBe(mockConfig.fromEmail);
      expect(emailContent.subject).toBe('Welcome to our platform!');
      expect(emailContent.html).toContain(`Welcome ${testUser.name}!`);
      expect(emailContent.html).toContain(testUser.email);
    });

    it('should handle email sending errors', async () => {
      // Mock console.log to throw an error
      consoleSpy.mockImplementation(() => {
        throw new Error('Email sending failed');
      });

      const result = await emailService.sendWelcomeEmail(testUser)();

      expect(result).toEqual(E.left({
        _tag: 'EmailServiceError',
        message: 'Email sending failed'
      }));
    });

    it('should handle unknown errors', async () => {
      consoleSpy.mockImplementation(() => {
        throw 'Unknown error';
      });

      const result = await emailService.sendWelcomeEmail(testUser)();

      expect(result).toEqual(E.left({
        _tag: 'EmailServiceError',
        message: 'Unknown email service error'
      }));
    });
  });

  describe('EmailConfig', () => {
    it('should accept valid email configuration', () => {
      const config: EmailConfig = {
        smtpHost: 'smtp.gmail.com',
        smtpPort: 465,
        username: 'user@gmail.com',
        password: 'app-password',
        fromEmail: 'noreply@company.com'
      };

      expect(config.smtpHost).toBe('smtp.gmail.com');
      expect(config.smtpPort).toBe(465);
      expect(config.username).toBe('user@gmail.com');
      expect(config.password).toBe('app-password');
      expect(config.fromEmail).toBe('noreply@company.com');
    });
  });
});
