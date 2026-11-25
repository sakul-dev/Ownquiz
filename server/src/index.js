import path from 'node:path';
import express from 'express';
import { config } from './config.js';
import { SubscriptionStore } from './store.js';
import { ReminderScheduler } from './scheduler.js';
import { nextOccurrence } from './schedule.js';
import { parseSubscriptionBody, parseEndpointBody } from './validate.js';
import { sendPush } from './push.js';

const store = await new SubscriptionStore(path.join(config.dataDir, 'subscriptions.json')).load();
const scheduler = new ReminderScheduler(store, {
  send: sendPush,
  siteUrl: config.siteUrl,
  tickMs: config.tickMs
});

const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', true);
app.use(express.json({ limit: '16kb' }));

function cors(req, res, next) {
  const origin = req.headers.origin;
  if (origin && (config.allowedOrigins.includes('*') || config.allowedOrigins.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Admin-Token');
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.sendStatus(204);
  }
  next();
}

const hits = new Map();

function rateLimit(req, res, next) {
  if (req.method !== 'POST') return next();
  const now = Date.now();
  const key = req.ip || 'unknown';
  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return next();
  }
  entry.count += 1;
  if (entry.count > 60) return res.status(429).json({ error: 'Too many requests, try again later.' });
  next();
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of hits) {
    if (entry.resetAt <= now) hits.delete(key);
  }
}, 10 * 60 * 1000).unref();

app.use(cors);
app.use(rateLimit);

const wrap = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

app.get('/', (req, res) => {
  res.type('text/plain').send('Ownquiz push server is running.');
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, subscriptions: store.size, now: new Date().toISOString() });
});

app.get('/api/vapid-public-key', (req, res) => {
  res.json({ publicKey: config.vapid.publicKey });
});

app.post('/api/subscribe', wrap(async (req, res) => {
  const parsed = parseSubscriptionBody(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const existing = store.get(parsed.value.endpoint);
  if (!existing && store.size >= config.maxSubscriptions) {
    return res.status(507).json({ error: 'Subscription limit reached.' });
  }

  const now = Date.now();
  const record = {
    ...parsed.value,
    enabled: true,
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
    lastShown: existing ? existing.lastShown || null : null,
    nextDue: nextOccurrence(parsed.value.time, parsed.value.timezone, now)
  };

  await store.upsert(record);
  console.log('[api] subscribed (' + parsed.value.timezone + ', ' + parsed.value.time + ')');
  res.json({ ok: true, nextDue: new Date(record.nextDue).toISOString() });
}));

app.post('/api/unsubscribe', wrap(async (req, res) => {
  const parsed = parseEndpointBody(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  await store.remove(parsed.endpoint);
  res.json({ ok: true });
}));

app.post('/api/test', wrap(async (req, res) => {
  if (!config.adminToken) return res.status(404).json({ error: 'Not found.' });
  if (req.get('x-admin-token') !== config.adminToken) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  let sent = 0;
  let failed = 0;
  for (const sub of store.list()) {
    try {
      await sendPush(sub, {
        title: sub.title || 'Ownquiz study reminder',
        body: 'This is a test notification from your push server.',
        url: sub.url || config.siteUrl || undefined
      });
      sent += 1;
    } catch (error) {
      failed += 1;
      if (error && (error.statusCode === 404 || error.statusCode === 410)) {
        await store.remove(sub.endpoint);
      }
    }
  }
  res.json({ ok: true, sent, failed });
}));

app.use((error, req, res, next) => {
  if (error && error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body.' });
  }
  console.error('[api] unhandled error:', error);
  res.status(500).json({ error: 'Internal server error.' });
});

const server = app.listen(config.port, () => {
  console.log('Ownquiz push server listening on http://localhost:' + config.port);
  console.log('VAPID public key: ' + config.vapid.publicKey);
  scheduler.start();
});

function shutdown(signal) {
  console.log('[server] ' + signal + ' received, shutting down.');
  scheduler.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
