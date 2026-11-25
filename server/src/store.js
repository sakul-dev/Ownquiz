import { promises as fs } from 'node:fs';
import path from 'node:path';

export class SubscriptionStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.items = new Map();
    this.writeChain = Promise.resolve();
  }

  async load() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        for (const item of list) {
          if (item && typeof item.endpoint === 'string') this.items.set(item.endpoint, item);
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    return this;
  }

  get size() {
    return this.items.size;
  }

  list() {
    return [...this.items.values()];
  }

  get(endpoint) {
    return this.items.get(endpoint);
  }

  upsert(record) {
    this.items.set(record.endpoint, record);
    return this.save();
  }

  remove(endpoint) {
    if (!this.items.delete(endpoint)) return Promise.resolve(false);
    return this.save().then(() => true);
  }

  save() {
    this.writeChain = this.writeChain
      .then(() => this.#write())
      .catch(error => {
        console.error('[store] failed to save subscriptions:', error.message);
      });
    return this.writeChain;
  }

  async #write() {
    const tmpPath = this.filePath + '.tmp';
    await fs.writeFile(tmpPath, JSON.stringify(this.list(), null, 2));
    await fs.rename(tmpPath, this.filePath);
  }
}
