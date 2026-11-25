import { nextOccurrence } from './schedule.js';

const MAX_LATE_MS = 6 * 60 * 60 * 1000;

function describe(endpoint) {
  try {
    return new URL(endpoint).host;
  } catch (error) {
    return 'unknown endpoint';
  }
}

export class ReminderScheduler {
  constructor(store, options = {}) {
    if (!store) throw new Error('ReminderScheduler requires a store.');
    if (typeof options.send !== 'function') throw new Error('ReminderScheduler requires a send function.');
    this.store = store;
    this.send = options.send;
    this.siteUrl = options.siteUrl || '';
    this.tickMs = options.tickMs || 30000;
    this.timer = null;
    this.running = false;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.tick().catch(error => console.error('[scheduler] tick failed:', error));
    }, this.tickMs);
    this.tick().catch(error => console.error('[scheduler] initial tick failed:', error));
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(now = Date.now()) {
    if (this.running) return;
    this.running = true;
    try {
      for (const sub of this.store.list()) {
        if (sub.enabled === false) continue;
        if (!Number.isFinite(sub.nextDue)) {
          sub.nextDue = nextOccurrence(sub.time, sub.timezone, now);
          await this.store.upsert(sub);
          continue;
        }
        if (sub.nextDue > now) continue;
        await this.#sendReminder(sub, now);
      }
    } finally {
      this.running = false;
    }
  }

  async #sendReminder(sub, now) {
    if (now - sub.nextDue > MAX_LATE_MS) {
      sub.nextDue = nextOccurrence(sub.time, sub.timezone, now);
      await this.store.upsert(sub);
      return;
    }

    try {
      await this.send(sub, {
        title: sub.title || 'Ownquiz study reminder',
        body: sub.body || 'Take a few minutes to review your slides.',
        url: sub.url || this.siteUrl || undefined
      });
      sub.lastShown = new Date(now).toISOString();
      sub.nextDue = nextOccurrence(sub.time, sub.timezone, now + 60000);
      await this.store.upsert(sub);
      console.log('[scheduler] sent reminder to', describe(sub.endpoint));
    } catch (error) {
      if (error && (error.statusCode === 404 || error.statusCode === 410)) {
        await this.store.remove(sub.endpoint);
        console.log('[scheduler] removed expired subscription', describe(sub.endpoint));
        return;
      }
      console.error('[scheduler] push failed:', error && error.message ? error.message : error);
      sub.nextDue = nextOccurrence(sub.time, sub.timezone, now);
      await this.store.upsert(sub);
    }
  }
}
