import webpush from 'web-push';
import { config } from './config.js';

webpush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey);

export async function sendPush(subscription, payload) {
  return webpush.sendNotification(
    { endpoint: subscription.endpoint, keys: subscription.keys },
    JSON.stringify(payload),
    { TTL: 3600, timeout: 10000 }
  );
}
