import * as E from 'fp-ts/Either'
import { pipe } from 'fp-ts/function'
import {
  validateCreateUserInput,
  combineValidations,
  required,
  minLength,
  CreateUserInput
} from './validation'

describe('validation', () => {
  describe('validateCreateUserInput', () => {
    it('should return Right for valid input', () => {
      const validInput: CreateUserInput = {
        email: 'test@example.com',
        name: 'John Doe',
        password: 'password123'
      }

      const result = validateCreateUserInput(validInput)

      expect(E.isRight(result)).toBe(true)
      if (E.isRight(result)) {
        expect(result.right).toEqual(validInput)
      }
    })

    it('should return Left for invalid email', () => {
      const invalidInput: CreateUserInput = {
        email: 'invalid-email',
        name: 'John Doe',
        password: 'password123'
      }

      const result = validateCreateUserInput(invalidInput)

      expect(E.isLeft(result)).toBe(true)
      if (E.isLeft(result)) {
        expect(result.left._tag).toBe('ValidationError')
        if (result.left._tag === 'ValidationError') {
          expect(result.left.errors).toContainEqual({
            field: 'email',
            message: 'Invalid email format'
          })
        }
      }
    })

    it('should return Left for empty email', () => {
      const invalidInput: CreateUserInput = {
        email: '',
        name: 'John Doe',
        password: 'password123'
      }

      const result = validateCreateUserInput(invalidInput)

      expect(E.isLeft(result)).toBe(true)
      if (E.isLeft(result) && result.left._tag === 'ValidationError') {
        expect(result.left.errors).toContainEqual({
          field: 'email',
          message: 'Invalid email format'
        })
      }
    })

    it('should return Left for short name', () => {
      const invalidInput: CreateUserInput = {
        email: 'test@example.com',
        name: 'J',
        password: 'password123'
      }

      const result = validateCreateUserInput(invalidInput)

      expect(E.isLeft(result)).toBe(true)
      if (E.isLeft(result) && result.left._tag === 'ValidationError') {
        expect(result.left.errors).toContainEqual({
          field: 'name',
          message: 'Name must be at least 2 characters'
        })
      }
    })

    it('should return Left for empty name', () => {
      const invalidInput: CreateUserInput = {
        email: 'test@example.com',
        name: '',
        password: 'password123'
      }

      const result = validateCreateUserInput(invalidInput)

      expect(E.isLeft(result)).toBe(true)
      if (E.isLeft(result) && result.left._tag === 'ValidationError') {
        expect(result.left.errors).toContainEqual({
          field: 'name',
          message: 'Name must be at least 2 characters'
        })
      }
    })

    it('should return Left for short password', () => {
      const invalidInput: CreateUserInput = {
        email: 'test@example.com',
        name: 'John Doe',
        password: '123'
      }

      const result = validateCreateUserInput(invalidInput)

      expect(E.isLeft(result)).toBe(true)
      if (E.isLeft(result) && result.left._tag === 'ValidationError') {
        expect(result.left.errors).toContainEqual({
          field: 'password',
          message: 'Password must be at least 6 characters'
        })
      }
    })

    it('should return Left for empty password', () => {
      const invalidInput: CreateUserInput = {
        email: 'test@example.com',
        name: 'John Doe',
        password: ''
      }

      const result = validateCreateUserInput(invalidInput)

      expect(E.isLeft(result)).toBe(true)
      if (E.isLeft(result) && result.left._tag === 'ValidationError') {
        expect(result.left.errors).toContainEqual({
          field: 'password',
          message: 'Password must be at least 6 characters'
        })
      }
    })

    it('should accumulate multiple validation errors', () => {
      const invalidInput: CreateUserInput = {
        email: 'invalid',
        name: 'J',
        password: '123'
      }

      const result = validateCreateUserInput(invalidInput)

      expect(E.isLeft(result)).toBe(true)
      if (E.isLeft(result) && result.left._tag === 'ValidationError') {
        expect(result.left.errors).toHaveLength(3)
        expect(result.left.errors).toContainEqual({
          field: 'email',
          message: 'Invalid email format'
        })
        expect(result.left.errors).toContainEqual({
          field: 'name',
          message: 'Name must be at least 2 characters'
        })
        expect(result.left.errors).toContainEqual({
          field: 'password',
          message: 'Password must be at least 6 characters'
        })
      }
    })
  })

  describe('required', () => {
    it('should return Right for non-empty string', () => {
      const result = required('email')('test@example.com')

      expect(E.isRight(result)).toBe(true)
      if (E.isRight(result)) {
        expect(result.right).toBe('test@example.com')
      }
    })

    it('should return Left for empty string', () => {
      const result = required('email')('')

      expect(E.isLeft(result)).toBe(true)
      if (E.isLeft(result)) {
        expect(result.left).toEqual([{
          field: 'email',
          message: 'email is required'
        }])
      }
    })

    it('should return Left for whitespace-only string', () => {
      const result = required('name')('   ')

      expect(E.isLeft(result)).toBe(true)
      if (E.isLeft(result)) {
        expect(result.left).toEqual([{
          field: 'name',
          message: 'name is required'
        }])
      }
    })
  })

  describe('minLength', () => {
    it('should return Right for string meeting minimum length', () => {
      const result = minLength('password', 6)('password123')

      expect(E.isRight(result)).toBe(true)
      if (E.isRight(result)) {
        expect(result.right).toBe('password123')
      }
    })

    it('should return Right for string exactly at minimum length', () => {
      const result = minLength('password', 6)('123456')

      expect(E.isRight(result)).toBe(true)
      if (E.isRight(result)) {
        expect(result.right).toBe('123456')
      }
    })

    it('should return Left for string below minimum length', () => {
      const result = minLength('password', 6)('123')

      expect(E.isLeft(result)).toBe(true)
      if (E.isLeft(result)) {
        expect(result.left).toEqual([{
          field: 'password',
          message: 'password must be at least 6 characters'
        }])
      }
    })
  })

  describe('combineValidations', () => {
    it('should return Right when all validations pass', () => {
      const validateUser = combineValidations<{ email: string; name: string }>(
        (user) => pipe(
          required('email')(user.email),
          E.map(() => user)
        ),
        (user) => pipe(
          minLength('name', 3)(user.name),
          E.map(() => user)
        )
      )

      const result = validateUser({ email: 'test@example.com', name: 'John' })

      expect(E.isRight(result)).toBe(true)
      if (E.isRight(result)) {
        expect(result.right).toEqual({ email: 'test@example.com', name: 'John' })
      }
    })

    it('should return Left when any validation fails', () => {
      const validateUser = combineValidations<{ email: string; name: string }>(
        (user) => pipe(
          required('email')(user.email),
          E.map(() => user)
        ),
        (user) => pipe(
          minLength('name', 3)(user.name),
          E.map(() => user)
        )
      )

      const result = validateUser({ email: 'test@example.com', name: 'Jo' })

      expect(E.isLeft(result)).toBe(true)
      if (E.isLeft(result)) {
        expect(result.left).toContainEqual({
          field: 'name',
          message: 'name must be at least 3 characters'
        })
      }
    })

    it('should accumulate errors from multiple failed validations', () => {
      const validateUser = combineValidations<{ email: string; name: string }>(
        (user) => pipe(
          required('email')(user.email),
          E.map(() => user)
        ),
        (user) => pipe(
          minLength('name', 3)(user.name),
          E.map(() => user)
        )
      )

      const result = validateUser({ email: '', name: 'Jo' })

      expect(E.isLeft(result)).toBe(true)
      if (E.isLeft(result)) {
        expect(result.left).toHaveLength(2)
        expect(result.left).toContainEqual({
          field: 'email',
          message: 'email is required'
        })
        expect(result.left).toContainEqual({
          field: 'name',
          message: 'name must be at least 3 characters'
        })
      }
    })
  })
})
