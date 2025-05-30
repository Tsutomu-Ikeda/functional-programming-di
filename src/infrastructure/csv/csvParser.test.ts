import * as E from 'fp-ts/Either';
import { parseUsersFromCSV, convertUsersToCsv } from './csvParser';
import { CreateUserInput } from '../../domain/userValidation';

describe('csvParser', () => {
  describe('parseUsersFromCSV', () => {
    it('should parse valid CSV with headers', () => {
      const csv = 'email,name,password\nuser1@example.com,User One,password123\nuser2@example.com,User Two,password456';

      const result = parseUsersFromCSV(csv);
      expect(E.isRight(result)).toBe(true);
      if (E.isRight(result)) {
        expect(result.right).toHaveLength(2);
        expect(result.right[0]).toEqual({
          email: 'user1@example.com',
          name: 'User One',
          password: 'password123'
        });
        expect(result.right[1]).toEqual({
          email: 'user2@example.com',
          name: 'User Two',
          password: 'password456'
        });
      }
    });

    it('should parse valid CSV without headers', () => {
      const csv = 'user1@example.com,User One,password123\nuser2@example.com,User Two,password456';

      const result = parseUsersFromCSV(csv);
      expect(E.isRight(result)).toBe(true);
      if (E.isRight(result)) {
        expect(result.right).toHaveLength(2);
        expect(result.right[0]).toEqual({
          email: 'user1@example.com',
          name: 'User One',
          password: 'password123'
        });
      }
    });

    it('should handle empty CSV', () => {
      const csv = '';

      const result = parseUsersFromCSV(csv);
      expect(E.isLeft(result)).toBe(true);
      if (E.isLeft(result)) {
        expect(result.left._tag).toBe('CSVParsingError');
      }
    });

    it('should handle CSV with only headers', () => {
      const csv = 'email,name,password';

      const result = parseUsersFromCSV(csv);
      expect(E.isLeft(result)).toBe(true);
      if (E.isLeft(result)) {
        expect(result.left._tag).toBe('CSVParsingError');
      }
    });

    it('should handle CSV with insufficient columns', () => {
      const csv = 'email,name,password\nuser1@example.com,User One';

      const result = parseUsersFromCSV(csv);
      expect(E.isLeft(result)).toBe(true);
      if (E.isLeft(result)) {
        expect(result.left._tag).toBe('CSVParsingError');
      }
    });
  });

  describe('convertUsersToCsv', () => {
    it('should convert users array to CSV format', () => {
      const users: CreateUserInput[] = [
        { email: 'user1@example.com', name: 'User One', password: 'password123' },
        { email: 'user2@example.com', name: 'User Two', password: 'password456' }
      ];

      const csv = convertUsersToCsv(users);

      expect(csv).toBe('email,name,password\nuser1@example.com,User One,password123\nuser2@example.com,User Two,password456');
    });

    it('should handle empty users array', () => {
      const users: CreateUserInput[] = [];

      const csv = convertUsersToCsv(users);

      expect(csv).toBe('email,name,password');
    });
  });
});
