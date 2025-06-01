import * as E from 'fp-ts/lib/Either';
import type { ValidationError } from '../domain/errors';

export function combineValidations<T>(
  ...validations: Array<(value: T) => E.Either<ValidationError[], T>>
): (value: T) => E.Either<ValidationError[], T> {
  return (value: T) => {
    const errors: ValidationError[] = [];

    for (const validation of validations) {
      const result = validation(value);
      if (E.isLeft(result)) {
        errors.push(...result.left);
      }
    }

    return errors.length > 0 ? E.left(errors) : E.right(value);
  };
}

export function required(field: string): (value: string) => E.Either<ValidationError[], string> {
  return (value: string) => {
    const isEmpty = !value || value.trim() === '';
    return isEmpty ? E.left([{ field, message: `${field} is required` }]) : E.right(value);
  };
}

export function minLength(field: string, min: number): (value: string) => E.Either<ValidationError[], string> {
  return (value: string) => {
    const isTooShort = value.length < min;
    return isTooShort ? E.left([{ field, message: `${field} must be at least ${min} characters` }]) : E.right(value);
  };
}
