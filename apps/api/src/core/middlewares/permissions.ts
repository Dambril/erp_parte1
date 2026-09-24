import type { NextFunction, Request, Response } from 'express';

export type PermissionAction = 'read' | 'create' | 'update' | 'delete';
export interface PermissionRequirement { module: string; action: PermissionAction }

export function permissionsMiddleware(_request: Request, _response: Response, next: NextFunction): void {
  next();
}
