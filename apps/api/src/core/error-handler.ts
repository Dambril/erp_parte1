import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger';

export const notFoundHandler: RequestHandler = (request, response) => {
  response.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route ${request.method} ${request.path} not found` },
    timestamp: new Date().toISOString(),
    path: request.path,
  });
};

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  // `error.status` cubre errores de body-parser (JSON malformado → 400, body demasiado grande → 413).
  const status = error instanceof ZodError ? 400 : error.statusCode ?? error.status ?? 500;
  const code = error instanceof ZodError
    ? 'VALIDATION_ERROR'
    : typeof error.code === 'string' && status < 500 ? error.code : status < 500 ? 'BAD_REQUEST' : 'INTERNAL_ERROR';
  const details = error instanceof ZodError
    ? error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message, code: issue.code }))
    : undefined;

  if (status >= 500) logger.error('Unhandled request error', { error: error instanceof Error ? error.stack : error });
  response.status(status).json({
    success: false,
    error: {
      code,
      message: status >= 500 ? 'Internal server error' : error instanceof ZodError ? 'Invalid request' : error.message,
      ...(details ? { details } : {}),
    },
    timestamp: new Date().toISOString(),
    path: request.path,
  });
};
