import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

dotenv.config({ path: path.join(SERVER_ROOT, '.env'), quiet: true });

function parseList(value, fallback) {
  if (!value) return fallback;
  const list = value.split(',').map(item => item.trim()).filter(Boolean);
  return list.length ? list : fallback;
}

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error('Missing required env var ' + name + '. Copy .env.example to .env and run `npm run keys`.');
  }
  return value;
}

export const config = {
  serverRoot: SERVER_ROOT,
  port: Number(process.env.PORT) || 8787,
  allowedOrigins: parseList(process.env.ALLOWED_ORIGINS, ['*']),
  siteUrl: process.env.SITE_URL || '',
  trustProxy: process.env.TRUST_PROXY === '1',
  dataDir: path.resolve(SERVER_ROOT, process.env.DATA_DIR || 'data'),
  adminToken: process.env.ADMIN_TOKEN || '',
  tickMs: Number(process.env.TICK_MS) || 30000,
  maxSubscriptions: Number(process.env.MAX_SUBSCRIPTIONS) || 5000,
  vapid: {
    subject: process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    publicKey: required('VAPID_PUBLIC_KEY'),
    privateKey: required('VAPID_PRIVATE_KEY')
  }
};
