import request from 'supertest';
import { createApp } from './app';
import type { ServerConfig } from '@erp/config';
import { TenantRepository } from './core/repository';

const config = {
  nodeEnv: 'test',
  port: 3000,
  mongodbUri: 'mongodb://localhost:27017/test',
  jwtSecret: 'test-secret',
  jwtExpiresIn: '15m',
  jwtRefreshSecret: 'test-refresh-secret',
  jwtRefreshExpiresIn: '7d',
  redisUrl: 'redis://localhost:6379',
  defaultTenantId: 'test-tenant',
} satisfies ServerConfig;

describe('GET /health', () => {
  it('reports a disconnected database instead of a false healthy state', async () => {
    const response = await request(createApp(config)).get('/health');
    expect(response.status).toBe(503);
    expect(response.body.data.database).toBe('disconnected');
  });
});

describe('TenantRepository', () => {
  it('rejects a query without tenantId', async () => {
    const collection = { findOne: jest.fn() } as never;
    const repository = new TenantRepository(collection);
    await expect(repository.findById('document-id')).rejects.toThrow('tenantId is required');
    expect((collection as { findOne: jest.Mock }).findOne).not.toHaveBeenCalled();
  });
});
