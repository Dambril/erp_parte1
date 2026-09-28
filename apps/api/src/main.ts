import path from 'node:path';
import dotenv from 'dotenv';
import { loadConfig } from '@erp/config';
import { logger } from './config/logger';
import { connectDB } from './config/database';
import { createApp } from './app';

// El .env.local vive en la raíz del monorepo; __dirname es apps/api/src (dev) o apps/api/dist (build).
dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') });

const config = loadConfig();

async function main() {
  logger.info('Starting ERP API...', { env: config.nodeEnv, port: config.port });

  await connectDB(config.mongodbUri, config.mongodbDbName);
  logger.info('MongoDB connected', { database: config.mongodbDbName ?? '(from URI)' });

  const app = createApp(config);

  app.listen(config.port, () => {
    logger.info(`ERP API running on port ${config.port}`, { env: config.nodeEnv });
  });
}

main().catch((err) => {
  logger.error('Failed to start server', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
