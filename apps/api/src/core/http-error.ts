import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Error con estado HTTP y código estable; el error handler lo serializa tal cual. */
export class HttpError extends Error {
  public constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Express 4 no captura promesas rechazadas: este wrapper las envía a `next` (y de ahí al error handler). */
export function asyncHandler(
  handler: (request: Request, response: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (request, response, next) => {
    handler(request, response, next).catch(next);
  };
}
