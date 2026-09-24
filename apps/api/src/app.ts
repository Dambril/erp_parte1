import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import type { ServerConfig } from '@erp/config';
import { isDatabaseConnected } from './config/database';
import { errorHandler } from './core/error-handler';
import { tenantMiddleware } from './core/middlewares/tenant';
import { authMiddleware } from './core/middlewares/auth';
import { permissionsMiddleware } from './core/middlewares/permissions';
import { auditMiddleware } from './core/middlewares/audit';
import { requestLogger } from './core/middlewares/request-logger';

export function createApp(_config: ServerConfig): express.Express {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(tenantMiddleware);
  app.use(authMiddleware);
  app.use(permissionsMiddleware);
  app.use(auditMiddleware);
  app.use(requestLogger);

  app.get('/health', (_request, response) => {
    const connected = isDatabaseConnected();
    response.status(connected ? 200 : 503).json({
      success: connected,
      data: { status: connected ? 'ok' : 'degraded', database: connected ? 'connected' : 'disconnected' },
      timestamp: new Date().toISOString(),
    });
  });
  app.use(errorHandler);
  return app;
}
