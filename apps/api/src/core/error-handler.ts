import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger';

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  const status = error instanceof ZodError ? 400 : error.statusCode ?? 500;
  const code = error instanceof ZodError ? 'VALIDATION_ERROR' : error.code ?? 'INTERNAL_ERROR';
  const details = error instanceof ZodError
    ? error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message, code: issue.code }))
    : undefined;

  if (status >= 500) logger.error('Unhandled request error', { error });
  response.status(status).json({
    success: false,
    error: { code, message: status >= 500 ? 'Internal server error' : error.message, ...(details ? { details } : {}) },
    timestamp: new Date().toISOString(),
    path: request.path,
  });
};
