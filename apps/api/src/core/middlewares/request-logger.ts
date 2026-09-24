import type { NextFunction, Request, Response } from 'express';
import { logger } from '../../config/logger';

export function requestLogger(request: Request, response: Response, next: NextFunction): void {
  const startedAt = Date.now();
  response.on('finish', () => logger.info('HTTP request', {
    method: request.method, path: request.path, status: response.statusCode, durationMs: Date.now() - startedAt,
  }));
  next();
}
