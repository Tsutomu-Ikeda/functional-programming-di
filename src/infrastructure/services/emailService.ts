import * as TE from 'fp-ts/lib/TaskEither';
import { User } from '../../domain/user';
import { DomainError } from '../../domain/errors';
import { EmailService } from '../../application/ports';

export interface EmailConfig {
  smtpHost: string;
  smtpPort: number;
  username: string;
  password: string;
  fromEmail: string;
}

export class MockEmailService implements EmailService {
  constructor(private config: EmailConfig) {}

  sendWelcomeEmail = (user: User): TE.TaskEither<DomainError, void> =>
    TE.tryCatch(
      async () => {
        // Simulate email sending delay
        await new Promise(resolve => setTimeout(resolve, 120));

        // Mock email sending logic
        console.log(`Sending welcome email to ${user.email} for user ${user.name}`);

        // Simulate occasional failures for testing
        if (Math.random() < 0.1) {
          throw new Error('SMTP server unavailable');
        }

        return undefined;
      },
      (error) => ({
        _tag: 'EmailServiceError' as const,
        message: error instanceof Error ? error.message : 'Unknown email service error',
      }),
    );
}

export class RealEmailService implements EmailService {
  constructor(private config: EmailConfig) {}

  sendWelcomeEmail = (user: User): TE.TaskEither<DomainError, void> =>
    TE.tryCatch(
      async () => {
        // In a real implementation, this would use a library like nodemailer
        // to send actual emails through SMTP

        const emailContent = {
          to: user.email,
          from: this.config.fromEmail,
          subject: 'Welcome to our platform!',
          html: `
            <h1>Welcome ${user.name}!</h1>
            <p>Thank you for joining our platform. We're excited to have you on board.</p>
            <p>Your account has been successfully created with the email: ${user.email}</p>
          `,
        };

        // Simulate sending email
        console.log('Sending email:', emailContent);

        return undefined;
      },
      (error) => ({
        _tag: 'EmailServiceError' as const,
        message: error instanceof Error ? error.message : 'Unknown email service error',
      }),
    );
}
