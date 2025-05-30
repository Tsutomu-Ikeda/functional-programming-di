import * as E from 'fp-ts/lib/Either';
import { CreateUserInput } from '../../domain/userValidation';
import { DomainError } from '../../domain/errors';

/**
 * Parse CSV content into an array of CreateUserInput objects
 * Expected CSV format: email,name,password,role (role is optional)
 */
export const parseUsersFromCSV = (csvContent: string): E.Either<DomainError, CreateUserInput[]> => {
  if (!csvContent || typeof csvContent !== 'string') {
    return E.left({
      _tag: 'CSVParsingError' as const,
      message: 'CSV content is empty or invalid'
    });
  }

  try {
    const lines = csvContent.split('\n').filter(line => line.trim().length > 0);
    if (lines.length === 0) {
      return E.left({
        _tag: 'CSVParsingError' as const,
        message: 'CSV file is empty'
      });
    }

    const firstLine = lines[0].toLowerCase();
    const isHeader = firstLine.includes('email') && firstLine.includes('name') && firstLine.includes('password');

    const startIndex = isHeader ? 1 : 0;
    if (startIndex === 1 && lines.length === 1) {
      return E.left({
        _tag: 'CSVParsingError' as const,
        message: 'CSV file contains only headers, no data'
      });
    }

    const users: CreateUserInput[] = [];

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = line.split(',').map(value => value.trim());
      if (values.length < 3) {
        return E.left({
          _tag: 'CSVParsingError' as const,
          message: `Line ${i + 1} has insufficient columns. Expected at least: email, name, password`
        });
      }

      const [email, name, password] = values;
      users.push({
        email,
        name,
        password
      });
    }

    if (users.length === 0) {
      return E.left({
        _tag: 'CSVParsingError' as const,
        message: 'No valid user data found in CSV'
      });
    }

    return E.right(users);
  } catch (error) {
    return E.left({
      _tag: 'CSVParsingError' as const,
      message: `Failed to parse CSV: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
};

/**
 * Convert CreateUserInput array to CSV format
 */
export const convertUsersToCsv = (users: CreateUserInput[]): string => {
  if (!users || !Array.isArray(users) || users.length === 0) {
    return 'email,name,password';
  }

  const header = 'email,name,password';
  const rows = users.map(user => `${user.email},${user.name},${user.password}`);
  return [header, ...rows].join('\n');
};
