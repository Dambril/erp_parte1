import { ConfigError, loadConfig } from '@erp/config';

const valid = {
  MONGODB_URI: 'mongodb+srv://usuario:clave@cluster.example.mongodb.net/erp',
  JWT_SECRET: 'un-secreto-de-prueba-largo',
  DEFAULT_TENANT_ID: 'tenant-a',
};

describe('loadConfig', () => {
  it('con lo mínimo aplica los valores por defecto', () => {
    expect(loadConfig(valid)).toMatchObject({
      nodeEnv: 'development', port: 3000, jwtExpiresIn: '15m', appWebUrl: 'http://localhost:5173', corsOrigins: [],
    });
  });

  it('si faltan variables falla nombrando cada una, sin mostrar valores', () => {
    const load = () => loadConfig({ JWT_SECRET: 'corto', EMAIL_FROM: 'sin-formato' });
    expect(load).toThrow(ConfigError);
    try {
      load();
    } catch (error) {
      const { message } = error as ConfigError;
      expect(message).toContain('MONGODB_URI: falta');
      expect(message).toContain('DEFAULT_TENANT_ID: falta');
      expect(message).toContain('JWT_SECRET: debe tener al menos 8 caracteres');
      expect(message).toContain('EMAIL_FROM: debe ser');
      expect(message).not.toContain('corto');
      expect(message).not.toContain('sin-formato');
    }
  });

  it('en producción APP_WEB_URL es obligatoria', () => {
    expect(() => loadConfig({ ...valid, NODE_ENV: 'production' })).toThrow('APP_WEB_URL: es obligatoria en producción');
  });

  it('acepta el remitente con nombre visible y separa CORS_ORIGINS por comas', () => {
    const config = loadConfig({
      ...valid, EMAIL_FROM: 'T-ssera Construcciones <onboarding@resend.dev>', APP_WEB_URL: 'https://web.example.test/',
      CORS_ORIGINS: 'http://localhost:5173, https://web.example.test/',
    });
    expect(config.emailFrom).toBe('T-ssera Construcciones <onboarding@resend.dev>');
    expect(config.appWebUrl).toBe('https://web.example.test');
    expect(config.corsOrigins).toEqual(['http://localhost:5173', 'https://web.example.test']);
  });
});
