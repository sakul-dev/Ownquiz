import { isValidTime, isValidTimeZone } from './schedule.js';

const MAX_ENDPOINT = 2048;
const MAX_TITLE = 120;
const MAX_BODY = 300;
const MAX_URL = 2048;

function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function cleanUrl(value) {
  if (typeof value !== 'string' || value.length > MAX_URL) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch (error) {
    return '';
  }
}

export function parseSubscriptionBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Body must be a JSON object.' };
  }
  const subscription = body.subscription;
  if (!subscription || typeof subscription !== 'object' || Array.isArray(subscription)) {
    return { error: 'Missing subscription.' };
  }
  const endpoint = subscription.endpoint;
  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://') || endpoint.length > MAX_ENDPOINT) {
    return { error: 'Invalid subscription.endpoint.' };
  }
  const keys = subscription.keys;
  if (!keys || typeof keys.p256dh !== 'string' || !keys.p256dh || typeof keys.auth !== 'string' || !keys.auth) {
    return { error: 'Invalid subscription.keys.' };
  }
  const time = typeof body.time === 'string' ? body.time : '18:00';
  if (!isValidTime(time)) return { error: 'Invalid time, expected HH:MM.' };
  const timezone = typeof body.timezone === 'string' && body.timezone ? body.timezone : 'UTC';
  if (!isValidTimeZone(timezone)) return { error: 'Invalid timezone.' };

  return {
    value: {
      endpoint,
      keys: { p256dh: keys.p256dh, auth: keys.auth },
      time,
      timezone,
      title: cleanText(body.title, MAX_TITLE),
      body: cleanText(body.body, MAX_BODY),
      url: cleanUrl(body.url)
    }
  };
}

export function parseEndpointBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Body must be a JSON object.' };
  }
  if (typeof body.endpoint !== 'string' || !body.endpoint.startsWith('https://') || body.endpoint.length > MAX_ENDPOINT) {
    return { error: 'Invalid endpoint.' };
  }
  return { endpoint: body.endpoint };
}
