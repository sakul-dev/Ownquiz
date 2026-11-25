'use strict';

const REMINDER_TAG = 'ownquiz-daily-reminder';

function notificationIcon() {
  return new URL('icons/icon-192.png', self.registration.scope).href;
}

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = data.url
    ? new URL(data.url, self.registration.scope).href
    : self.registration.scope;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        try {
          await client.focus();
          return;
        } catch (e) {}
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});

self.addEventListener('push', event => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch (e) {
      payload = { body: event.data.text() };
    }
  }
  const title = payload.title || 'Ownquiz study reminder';
  const body = payload.body || 'Take a few minutes to review your slides.';
  event.waitUntil(self.registration.showNotification(title, {
    body: body,
    icon: notificationIcon(),
    tag: REMINDER_TAG,
    data: { url: payload.url || self.registration.scope }
  }));
});
