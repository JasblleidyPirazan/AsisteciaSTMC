import dotenv from 'dotenv';

dotenv.config();

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Variable de entorno requerida no definida: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  jwtSecret: required('JWT_SECRET', process.env.NODE_ENV === 'production' ? undefined : 'dev-secret-change-me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '12h',
  adminEmail: process.env.ADMIN_EMAIL ?? 'admin@tenis.local',
  adminPassword: process.env.ADMIN_PASSWORD ?? 'admin1234',
  isProduction: process.env.NODE_ENV === 'production',
};
