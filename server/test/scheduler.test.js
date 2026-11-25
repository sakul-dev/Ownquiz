import test from 'node:test';
import assert from 'node:assert/strict';
import { ReminderScheduler } from '../src/scheduler.js';

function memoryStore(records) {
  const items = new Map(records.map(record => [record.endpoint, { ...record }]));
  return {
    get size() {
      return items.size;
    },
    list: () => [...items.values()],
    get: endpoint => items.get(endpoint),
    upsert: async record => {
      items.set(record.endpoint, record);
    },
    remove: async endpoint => items.delete(endpoint)
  };
}

function makeSubscription(overrides = {}) {
  return {
    endpoint: 'https://push.example.com/send/abc',
    keys: { p256dh: 'test-key', auth: 'test-auth' },
    time: '18:00',
    timezone: 'UTC',
    enabled: true,
    nextDue: Date.parse('2026-01-10T18:00:00Z'),
    ...overrides
  };
}

function setup(subscription) {
  const store = memoryStore([subscription]);
  const sent = [];
  const scheduler = new ReminderScheduler(store, {
    send: async (record, payload) => {
      sent.push({ record, payload });
    },
    siteUrl: 'https://sakul-dev.github.io/Ownquiz/'
  });
  return { store, sent, scheduler };
}

test('sends a due reminder and schedules the next day', async () => {
  const subscription = makeSubscription();
  const { store, sent, scheduler } = setup(subscription);
  const now = Date.parse('2026-01-10T18:00:30Z');

  await scheduler.tick(now);

  assert.equal(sent.length, 1);
  assert.equal(sent[0].payload.title, 'Ownquiz study reminder');
  assert.equal(sent[0].payload.url, 'https://sakul-dev.github.io/Ownquiz/');
  const updated = store.get(subscription.endpoint);
  assert.equal(updated.lastShown, '2026-01-10T18:00:30.000Z');
  assert.equal(updated.nextDue, Date.parse('2026-01-11T18:00:00Z'));
});

test('does not send before the reminder is due', async () => {
  const subscription = makeSubscription();
  const { store, sent, scheduler } = setup(subscription);

  await scheduler.tick(Date.parse('2026-01-10T17:59:00Z'));

  assert.equal(sent.length, 0);
  assert.equal(store.get(subscription.endpoint).nextDue, subscription.nextDue);
});

test('skips disabled subscriptions', async () => {
  const subscription = makeSubscription({ enabled: false });
  const { sent, scheduler } = setup(subscription);

  await scheduler.tick(Date.parse('2026-01-10T18:00:30Z'));

  assert.equal(sent.length, 0);
});

test('does not send very late reminders, just reschedules', async () => {
  const subscription = makeSubscription({ nextDue: Date.parse('2026-01-10T00:00:00Z') });
  const { store, sent, scheduler } = setup(subscription);

  await scheduler.tick(Date.parse('2026-01-10T18:00:00Z'));

  assert.equal(sent.length, 0);
  assert.equal(store.get(subscription.endpoint).nextDue, Date.parse('2026-01-11T18:00:00Z'));
});

test('removes subscriptions that push services report as gone', async () => {
  const subscription = makeSubscription();
  const store = memoryStore([subscription]);
  const gone = Object.assign(new Error('gone'), { statusCode: 410 });
  const scheduler = new ReminderScheduler(store, {
    send: async () => {
      throw gone;
    }
  });

  await scheduler.tick(Date.parse('2026-01-10T18:00:30Z'));

  assert.equal(store.size, 0);
});

test('keeps subscriptions on transient failures and retries next day', async () => {
  const subscription = makeSubscription();
  const store = memoryStore([subscription]);
  const scheduler = new ReminderScheduler(store, {
    send: async () => {
      throw Object.assign(new Error('boom'), { statusCode: 500 });
    }
  });

  await scheduler.tick(Date.parse('2026-01-10T18:00:30Z'));

  assert.equal(store.size, 1);
  assert.equal(store.get(subscription.endpoint).nextDue, Date.parse('2026-01-11T18:00:00Z'));
});

test('schedules subscriptions that are missing nextDue', async () => {
  const subscription = makeSubscription({ nextDue: undefined });
  const { store, sent, scheduler } = setup(subscription);

  await scheduler.tick(Date.parse('2026-01-10T10:00:00Z'));

  assert.equal(sent.length, 0);
  assert.equal(store.get(subscription.endpoint).nextDue, Date.parse('2026-01-10T18:00:00Z'));
});

test('uses custom title, body and url when provided', async () => {
  const subscription = makeSubscription({
    title: 'Custom title',
    body: 'Custom body',
    url: 'https://example.com/custom'
  });
  const { sent, scheduler } = setup(subscription);

  await scheduler.tick(Date.parse('2026-01-10T18:00:30Z'));

  assert.deepEqual(sent[0].payload, {
    title: 'Custom title',
    body: 'Custom body',
    url: 'https://example.com/custom'
  });
});
