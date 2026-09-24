import dotenv from 'dotenv';
import { loadConfig, type ServerConfig } from '@erp/config';
import { logger } from './config/logger';
import { connectDB } from './config/database';
import { createApp } from './app';

dotenv.config();

const config = loadConfig();

async function main() {
  logger.info('Starting ERP API...', { env: config.nodeEnv, port: config.port });

  await connectDB(config.mongodbUri);
  logger.info('MongoDB connected');

  const app = createApp(config);

  app.listen(config.port, () => {
    logger.info(`ERP API running on port ${config.port}`, { env: config.nodeEnv });
  });
}

main().catch((err) => {
  logger.error('Failed to start server', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
