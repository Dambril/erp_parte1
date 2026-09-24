import type { NextFunction, Request, Response } from 'express';

export interface AuditEvent {
  tenantId: string;
  actorId: string;
  action: string;
  entity: string;
  entityId?: string;
  occurredAt: Date;
}

export function auditMiddleware(_request: Request, _response: Response, next: NextFunction): void {
  next();
}
