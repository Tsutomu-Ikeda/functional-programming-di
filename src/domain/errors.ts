export interface ValidationError {
  field: string
  message: string
}

export type DomainError =
  | { _tag: 'UserNotFound'; userId: string }
  | { _tag: 'InvalidEmail'; email: string }
  | { _tag: 'Unauthorized'; reason: string }
  | { _tag: 'ValidationError'; errors: readonly ValidationError[] }
  | { _tag: 'BulkValidationError'; failedInputs: Array<{ input: any; errors: ValidationError[] }> }
  | { _tag: 'DatabaseError'; message: string }
  | { _tag: 'EmailServiceError'; message: string }
  | { _tag: 'CSVParsingError'; message: string }
  | { _tag: 'UnknownError'; message: string };
