import * as E from 'fp-ts/Either';
import { createUserEntity } from './userFactory';
import { CreateUserInput } from './userValidation';

describe('userFactory', () => {
  describe('createUserEntity', () => {
    it('should create a user entity with generated id', () => {
      const input: CreateUserInput = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123'
      };

      const result = createUserEntity(input);

      expect(result).toEqual(E.right({
        email: input.email,
        name: input.name,
        role: 'user',
        id: expect.any(String)
      }));
    });
it('should generate unique ids for different users', () => {
      const input1: CreateUserInput = {
        email: 'user1@example.com',
        name: 'User One',
        password: 'password123'
      };

      const input2: CreateUserInput = {
        email: 'user2@example.com',
        name: 'User Two',
        password: 'password456'
      };

      const result1 = createUserEntity(input1);
      const result2 = createUserEntity(input2);

      expect(E.isRight(result1)).toBe(true);
      expect(E.isRight(result2)).toBe(true);

      const result1Id = E.isRight(result1) ? result1.right.id : null;
      const result2Id = E.isRight(result2) ? result2.right.id : null;
      expect(result1Id).not.toBe(result2Id);
    });
it('should always assign user role by default', () => {
      const input: CreateUserInput = {
        email: 'admin@example.com',
        name: 'Admin User',
        password: 'password123'
      };

      const result = createUserEntity(input);

      expect(result).toEqual(E.right({
        email: expect.any(String),
        name: expect.any(String),
        role: 'user',
        id: expect.any(String)
      }));
    });
  });
});
