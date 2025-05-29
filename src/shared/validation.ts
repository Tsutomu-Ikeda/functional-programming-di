import * as E from 'fp-ts/Either'
import { ValidationError, DomainError } from '../domain/errors'

export function validateCreateUserInput(input: CreateUserInput): E.Either<DomainError, CreateUserInput> {
  const errors: ValidationError[] = []
  
  if (!isValidEmail(input.email)) {
    errors.push({ field: 'email', message: 'Invalid email format' })
  }
  
  if (!isValidName(input.name)) {
    errors.push({ field: 'name', message: 'Name must be at least 2 characters' })
  }
  
  if (!isValidPassword(input.password)) {
    errors.push({ field: 'password', message: 'Password must be at least 6 characters' })
  }
  
  return errors.length > 0 
    ? E.left({ _tag: 'ValidationError', errors })
    : E.right(input)
}

export function combineValidations<T>(
  ...validations: Array<(value: T) => E.Either<ValidationError[], T>>
): (value: T) => E.Either<ValidationError[], T> {
  return (value: T) => {
    const errors: ValidationError[] = []
    
    for (const validation of validations) {
      const result = validation(value)
      if (E.isLeft(result)) {
        errors.push(...result.left)
      }
    }
    
    return errors.length > 0 ? E.left(errors) : E.right(value)
  }
}

export function required(field: string): (value: string) => E.Either<ValidationError[], string> {
  return (value: string) => {
    const isEmpty = !value || value.trim() === ''
    return isEmpty
      ? E.left([{ field, message: `${field} is required` }])
      : E.right(value)
  }
}

export function minLength(field: string, min: number): (value: string) => E.Either<ValidationError[], string> {
  return (value: string) => {
    const isTooShort = value.length < min
    return isTooShort
      ? E.left([{ field, message: `${field} must be at least ${min} characters` }])
      : E.right(value)
  }
}

export interface CreateUserInput {
  email: string
  name: string
  password: string
}

const isValidEmail = (email: string): boolean => 
  Boolean(email && email.includes('@'))

const isValidName = (name: string): boolean => 
  Boolean(name && name.length >= 2)

const isValidPassword = (password: string): boolean => 
  Boolean(password && password.length >= 6)
