import type { NextFunction, Request, Response } from 'express';

export interface AuthContext {
  userId: string;
  roles: string[];
}

export function authMiddleware(_request: Request, _response: Response, next: NextFunction): void {
  next();
}
