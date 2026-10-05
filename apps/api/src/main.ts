import path from 'node:path';
import dotenv from 'dotenv';
import { loadConfig } from '@erp/config';
import { logger } from './config/logger';
import { closeDB, connectDB, getDatabase } from './config/database';
import { ensureIndexes } from './indexes';
import { RealtimeHub } from './core/realtime';
import { createApp } from './app';

// El .env.local vive en la raíz del monorepo; __dirname es apps/api/src (dev) o apps/api/dist (build).
dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') });

function loadConfigOrExit() {
  try {
    return loadConfig();
  } catch (error) {
    // Falta o es inválida una variable de entorno: se dice cuál, sin volcar la traza ni los valores.
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

const config = loadConfigOrExit();

async function main() {
  logger.info('Starting ERP API...', { env: config.nodeEnv, port: config.port });

  await connectDB(config.mongodbUri, config.mongodbDbName);
  logger.info('MongoDB connected', { database: config.mongodbDbName ?? '(from URI)' });
  await ensureIndexes(getDatabase());

  const realtime = new RealtimeHub(config);
  const app = createApp(config, realtime.publish);

  const server = app.listen(config.port, () => {
    logger.info(`ERP API running on port ${config.port}`, { env: config.nodeEnv });
  });
  realtime.attach(server);

  // Render envía SIGTERM en cada redeploy: se dejan de aceptar conexiones, se terminan las
  // peticiones en curso y se cierra Mongo. Si algo se cuelga, se fuerza la salida.
  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('Shutting down', { signal });
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000).unref();
    // Los WebSocket abiertos impedirían que server.close termine.
    realtime.close();
    server.close(async () => {
      await closeDB();
      logger.info('Shutdown complete');
      process.exit(0);
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.error('Failed to start server', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
