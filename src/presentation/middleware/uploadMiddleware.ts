import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import * as TE from 'fp-ts/lib/TaskEither';
import * as E from 'fp-ts/lib/Either';
import { pipe } from 'fp-ts/lib/function';
import { DomainError } from '../../domain/errors';

const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const csvFileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext !== '.csv') {
    return cb(new Error('Only CSV files are allowed'));
  }
  cb(null, true);
};

export const csvUpload = multer({
  storage,
  fileFilter: csvFileFilter,
  limits: {
    fileSize: 1024 * 1024 * 5 // 5MB limit
  }
});

export const handleUploadErrors = (err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: {
          _tag: 'ValidationError',
          errors: [{ field: 'file', message: 'File size exceeds the 5MB limit' }]
        }
      });
    }
    return res.status(400).json({
      error: {
        _tag: 'ValidationError',
        errors: [{ field: 'file', message: `Upload error: ${err.message}` }]
      }
    });
  }
  
  if (err.message === 'Only CSV files are allowed') {
    return res.status(400).json({
      error: {
        _tag: 'ValidationError',
        errors: [{ field: 'file', message: 'Only CSV files are allowed' }]
      }
    });
  }
  
  next(err);
};

export const readFileContent = (filePath: string): TE.TaskEither<DomainError, string> => {
  return TE.tryCatch(
    () => fs.promises.readFile(filePath, 'utf8'),
    (error) => ({
      _tag: 'CSVParsingError' as const,
      message: `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`
    })
  );
};

export const deleteFile = (filePath: string): TE.TaskEither<DomainError, void> => {
  return TE.tryCatch(
    () => fs.promises.unlink(filePath),
    (error) => ({
      _tag: 'UnknownError' as const,
      message: `Failed to delete file: ${error instanceof Error ? error.message : 'Unknown error'}`
    })
  );
};
