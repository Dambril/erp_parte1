import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import type { ServerConfig } from '@erp/config';
import { pingDatabase } from './config/database';
import { errorHandler, notFoundHandler } from './core/error-handler';
import { tenantMiddleware } from './core/middlewares/tenant';
import { authMiddleware } from './core/middlewares/auth';
import { requestLogger } from './core/middlewares/request-logger';
import { REALTIME_PATH, type RealtimePublisher } from './core/realtime';
import { identityRoutes } from './modules/identity/identity.routes';
import type { Mailer } from './platform/integrations/email';
import { catalogsRoutes } from './modules/catalogs/catalogs.routes';
import { inventoryRoutes } from './modules/inventory/inventory.routes';
import { obrasRoutes } from './modules/obras/obras.routes';

function corsOrigin(config: ServerConfig): cors.CorsOptions['origin'] {
  if (config.corsOrigins.length > 0) return config.corsOrigins;
  // Sin lista explícita: abierto en desarrollo/test, cerrado a navegadores en producción.
  return config.nodeEnv !== 'production';
}

/**
 * `publish` difunde los cambios por el canal de tiempo real; sin hub (tests) no hace nada.
 * `mailer` envía los correos de identidad; sin él se usa el de la configuración (Resend, o ninguno sin API key).
 */
export function createApp(
  config: ServerConfig,
  publish: RealtimePublisher = () => undefined,
  mailer?: Mailer,
): express.Express {
  const app = express();
  // Render (y cualquier PaaS) termina TLS en un proxy; sin esto req.ip sería la del proxy y el rate limit sería global.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(cors({ origin: corsOrigin(config) }));
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }));
  app.use(express.json({ limit: '100kb' }));
  app.use(requestLogger);
  app.use(authMiddleware(config));
  app.use(tenantMiddleware);

  app.get('/', (_request, response) => {
    response.json({
      success: true,
      data: {
        name: 'ERP API',
        // Render define RENDER_GIT_COMMIT: permite ver qué commit está desplegado.
        commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? 'local',
        endpoints: [
          'GET /health', 'POST /auth/login', 'POST /auth/refresh', 'POST /auth/logout', 'GET /auth/me',
          'GET /users', 'POST /users',
          'GET /obras', 'GET /obras/resumen', 'GET /obras/:id', 'POST /obras', 'PATCH /obras/:id', 'DELETE /obras/:id',
          'POST /obras/:id/aprobar', 'POST /obras/:id/solicitar-cambios', 'POST /obras/:id/mediciones',
          `WS ${REALTIME_PATH}`,
        ],
      },
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/health', async (_request, response) => {
    let connected = false;
    try {
      await pingDatabase();
      connected = true;
    } catch {
      connected = false;
    }
    response.status(connected ? 200 : 503).json({
      success: connected,
      data: { status: connected ? 'ok' : 'degraded', database: connected ? 'connected' : 'disconnected' },
      timestamp: new Date().toISOString(),
    });
  });

  const identity = identityRoutes(config, mailer);
  app.use('/auth', identity.auth);
  app.use('/users', identity.users);
  app.use('/catalogs', catalogsRoutes());
  app.use('/inventory', inventoryRoutes());
  app.use('/obras', obrasRoutes(publish));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
