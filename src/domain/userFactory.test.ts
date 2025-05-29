import * as E from 'fp-ts/Either'
import { createUserEntity } from './userFactory'
import { CreateUserInput } from '../shared/validation'

describe('userFactory', () => {
  describe('createUserEntity', () => {
    it('should create a user entity with generated id', () => {
      const input: CreateUserInput = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123'
      }

      const result = createUserEntity(input)

      expect(E.isRight(result)).toBe(true)
      if (E.isRight(result)) {
        const user = result.right
        expect(user.email).toBe(input.email)
        expect(user.name).toBe(input.name)
        expect(user.role).toBe('user')
        expect(user.id).toBeDefined()
        expect(typeof user.id).toBe('string')
        expect(user.id.length).toBeGreaterThan(0)
      }
    })

    it('should generate unique ids for different users', () => {
      const input1: CreateUserInput = {
        email: 'user1@example.com',
        name: 'User One',
        password: 'password123'
      }

      const input2: CreateUserInput = {
        email: 'user2@example.com',
        name: 'User Two',
        password: 'password456'
      }

      const result1 = createUserEntity(input1)
      const result2 = createUserEntity(input2)

      expect(E.isRight(result1)).toBe(true)
      expect(E.isRight(result2)).toBe(true)

      if (E.isRight(result1) && E.isRight(result2)) {
        expect(result1.right.id).not.toBe(result2.right.id)
      }
    })

    it('should always assign user role by default', () => {
      const input: CreateUserInput = {
        email: 'admin@example.com',
        name: 'Admin User',
        password: 'password123'
      }

      const result = createUserEntity(input)

      expect(E.isRight(result)).toBe(true)
      if (E.isRight(result)) {
        expect(result.right.role).toBe('user')
      }
    })
  })
})
