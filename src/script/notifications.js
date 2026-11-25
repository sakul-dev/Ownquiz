'use strict';

const NOTIFY_KEY = 'ownquiz.notify.v1';
const NOTIFY_TAG = 'ownquiz-daily-reminder';
const DEFAULT_REMINDER_TIME = '18:00';

let notifySettings = loadNotifySettings();
let notifyTimer = null;
let notificationsInitialized = false;
let reminderShowing = false;
let serviceWorkerRegistration = null;

function defaultNotifySettings() {
  return {
    enabled: false,
    time: DEFAULT_REMINDER_TIME,
    nextDue: 0,
    lastShown: '',
    dismissed: false,
    iosHintDismissed: false
  };
}

function loadNotifySettings() {
  const saved = readJson(NOTIFY_KEY);
  const settings = defaultNotifySettings();
  if (!saved || typeof saved !== 'object') return settings;
  if (saved.enabled) settings.enabled = true;
  if (typeof saved.time === 'string' && /^\d{2}:\d{2}$/.test(saved.time)) settings.time = saved.time;
  if (Number.isFinite(saved.nextDue)) settings.nextDue = saved.nextDue;
  if (typeof saved.lastShown === 'string') settings.lastShown = saved.lastShown;
  settings.dismissed = !!saved.dismissed;
  settings.iosHintDismissed = !!saved.iosHintDismissed;
  return settings;
}

function saveNotifySettings() {
  storageSet(NOTIFY_KEY, JSON.stringify(notifySettings));
}

function notifyDateKey(date) {
  const d = date || new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function isIOSDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandaloneApp() {
  return navigator.standalone === true ||
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches);
}

function notificationsSupported() {
  return window.location.protocol !== 'file:' &&
    window.isSecureContext &&
    ('Notification' in window) &&
    ('serviceWorker' in navigator);
}

function notificationPermission() {
  return ('Notification' in window) ? Notification.permission : 'unsupported';
}

function registerNotificationServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return Promise.resolve(null);
  if (!serviceWorkerRegistration) {
    serviceWorkerRegistration = navigator.serviceWorker.register('./sw.js').catch(() => {
      serviceWorkerRegistration = null;
      return null;
    });
  }
  return serviceWorkerRegistration;
}

async function getNotificationRegistration() {
  const registration = await registerNotificationServiceWorker();
  if (!registration) return null;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise(resolve => window.setTimeout(() => resolve(registration), 3000))
    ]);
  } catch (e) {
    return registration;
  }
}

function reminderBody() {
  const total = state.cards.length;
  const known = state.cards.filter(c => state.known.has(c.id)).length;
  const remaining = Math.max(0, total - known);
  if (total && remaining === 0) {
    return 'You have learned every slide. A quick review keeps them fresh.';
  }
  if (remaining > 0) {
    return 'You have ' + remaining + (remaining === 1 ? ' slide' : ' slides') +
      ' left to learn in ' + state.source + '.';
  }
  return 'Take a few minutes to review your slides.';
}

async function showDailyReminder() {
  if (notificationPermission() !== 'granted') return false;
  const options = {
    body: reminderBody(),
    tag: NOTIFY_TAG,
    data: { url: new URL('./', window.location.href).href },
    icon: new URL('./icons/icon-192.png', window.location.href).href
  };
  try {
    const registration = await getNotificationRegistration();
    if (registration && registration.showNotification) {
      if (registration.getNotifications) {
        try {
          const existing = await registration.getNotifications({ tag: NOTIFY_TAG });
          for (const notification of existing) notification.close();
        } catch (e) {}
      }
      await registration.showNotification('Ownquiz study reminder', options);
      return true;
    }
  } catch (e) {}
  try {
    new Notification('Ownquiz study reminder', options);
    return true;
  } catch (e) {
    return false;
  }
}

function computeNextDue(time, from) {
  const parts = String(time || DEFAULT_REMINDER_TIME).split(':');
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  const start = from ? from.getTime() : Date.now();
  const d = new Date(start);
  d.setHours(Number.isFinite(hours) ? hours : 18, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  if (d.getTime() <= start) d.setDate(d.getDate() + 1);
  return d.getTime();
}

function ensureReminderTimer() {
  if (notifyTimer || !notifySettings.enabled) return;
  notifyTimer = window.setInterval(checkReminder, 60 * 1000);
}

function clearReminderTimer() {
  if (!notifyTimer) return;
  window.clearInterval(notifyTimer);
  notifyTimer = null;
}

function checkReminder() {
  if (!notificationsInitialized) return;
  if (!notifySettings.enabled) {
    clearReminderTimer();
    return;
  }
  if (notificationPermission() !== 'granted') {
    notifySettings.enabled = false;
    notifySettings.nextDue = 0;
    saveNotifySettings();
    updateNotifyUi();
    clearReminderTimer();
    return;
  }
  const now = Date.now();
  if (!notifySettings.nextDue) {
    notifySettings.nextDue = computeNextDue(notifySettings.time, new Date(now));
    saveNotifySettings();
  }
  if (now < notifySettings.nextDue) return;
  if (notifySettings.lastShown === notifyDateKey()) {
    notifySettings.nextDue = computeNextDue(notifySettings.time, new Date(now + 60000));
    saveNotifySettings();
    return;
  }
  if (reminderShowing) return;
  reminderShowing = true;
  showDailyReminder().then(shown => {
    if (shown) {
      notifySettings.lastShown = notifyDateKey();
      notifySettings.nextDue = computeNextDue(notifySettings.time, new Date(Date.now() + 60000));
      saveNotifySettings();
      updateNotifyUi();
    }
  }).catch(() => {}).then(() => {
    reminderShowing = false;
  });
}

function showNotifyPrompt(mode) {
  const prompt = document.getElementById('notifyPrompt');
  if (!prompt) return;
  const title = document.getElementById('notifyTitle');
  const body = document.getElementById('notifyBody');
  const timeWrap = document.getElementById('notifyTimeWrap');
  const timeInput = document.getElementById('notifyTime');
  const enable = document.getElementById('notifyEnable');
  const dismiss = document.getElementById('notifyDismiss');
  const isIosHint = mode === 'ios';
  const isBlocked = mode === 'blocked';

  prompt.classList.remove('hidden');
  prompt.dataset.mode = mode;

  if (isIosHint) {
    title.textContent = 'Get reminders on iPhone';
    body.textContent = 'Add Ownquiz to your Home Screen, then open it from the new icon to enable reminders. Use your browser\'s share menu and choose Add to Home Screen.';
    if (timeWrap) timeWrap.classList.add('hidden');
    if (enable) enable.classList.add('hidden');
    if (dismiss) dismiss.textContent = 'Got it';
  } else if (isBlocked) {
    title.textContent = 'Notifications are blocked';
    body.textContent = isIOSDevice()
      ? 'Allow notifications for Ownquiz in Settings, then try again.'
      : 'Allow notifications for this site in your browser settings, then try again.';
    if (timeWrap) timeWrap.classList.add('hidden');
    if (enable) enable.classList.add('hidden');
    if (dismiss) dismiss.textContent = 'OK';
  } else {
    title.textContent = 'Daily study reminder';
    body.textContent = 'Get one notification a day while Ownquiz is open, reminding you to review your slides.';
    if (timeWrap) timeWrap.classList.remove('hidden');
    if (enable) enable.classList.remove('hidden');
    if (dismiss) dismiss.textContent = 'Not now';
    if (timeInput) timeInput.value = notifySettings.time;
  }

  if (prompt.scrollIntoView) prompt.scrollIntoView({ block: 'nearest' });
}

function hideNotifyPrompt() {
  const prompt = document.getElementById('notifyPrompt');
  if (prompt) prompt.classList.add('hidden');
}

function maybeShowFirstRunPrompt() {
  if (notifySettings.enabled) return;
  if (isIOSDevice() && !isStandaloneApp()) {
    if (!notifySettings.iosHintDismissed) showNotifyPrompt('ios');
    return;
  }
  if (!notificationsSupported()) return;
  if (notifySettings.dismissed) return;
  if (notificationPermission() === 'denied') return;
  showNotifyPrompt('enable');
}

async function handleNotifyEnable() {
  if (!notificationsSupported()) {
    showNotifyPrompt(isIOSDevice() ? 'ios' : 'blocked');
    return;
  }
  if (notificationPermission() === 'denied') {
    showNotifyPrompt('blocked');
    return;
  }

  let permission = notificationPermission();
  if (permission === 'default') {
    try {
      permission = await Notification.requestPermission();
    } catch (e) {
      permission = notificationPermission();
    }
  }

  if (permission !== 'granted') {
    notifySettings.dismissed = true;
    saveNotifySettings();
    hideNotifyPrompt();
    updateNotifyUi();
    if (permission === 'denied') showNotifyPrompt('blocked');
    return;
  }

  const timeInput = document.getElementById('notifyTime');
  const chosen = timeInput && /^\d{2}:\d{2}$/.test(timeInput.value)
    ? timeInput.value
    : notifySettings.time;
  notifySettings.enabled = true;
  notifySettings.time = chosen;
  notifySettings.dismissed = false;
  notifySettings.lastShown = '';
  notifySettings.nextDue = computeNextDue(chosen, new Date());
  saveNotifySettings();
  hideNotifyPrompt();
  updateNotifyUi();
  ensureReminderTimer();
  checkReminder();
}

function handleNotifyDismiss() {
  const prompt = document.getElementById('notifyPrompt');
  const mode = prompt ? prompt.dataset.mode : '';
  if (mode === 'ios') notifySettings.iosHintDismissed = true;
  else notifySettings.dismissed = true;
  saveNotifySettings();
  hideNotifyPrompt();
  updateNotifyUi();
}

function handleReminderToggle() {
  if (notifySettings.enabled) {
    notifySettings.enabled = false;
    notifySettings.nextDue = 0;
    saveNotifySettings();
    clearReminderTimer();
    updateNotifyUi();
    return;
  }
  if (isIOSDevice() && !isStandaloneApp()) {
    closeMenu();
    showNotifyPrompt('ios');
    return;
  }
  if (!notificationsSupported()) return;
  closeMenu();
  showNotifyPrompt(notificationPermission() === 'denied' ? 'blocked' : 'enable');
}

function handleReminderTimeChange(e) {
  const value = e.target.value;
  if (!/^\d{2}:\d{2}$/.test(value)) return;
  notifySettings.time = value;
  if (notifySettings.enabled) {
    notifySettings.nextDue = computeNextDue(value, new Date());
  }
  saveNotifySettings();
  checkReminder();
}

function reconcileNotifySettings() {
  if (notifySettings.enabled && notificationPermission() !== 'granted') {
    notifySettings.enabled = false;
    notifySettings.nextDue = 0;
    saveNotifySettings();
  }
}

function updateNotifyUi() {
  const filter = document.getElementById('reminderFilter');
  const toggle = document.getElementById('reminderToggle');
  const timeInput = document.getElementById('reminderTime');
  if (!filter) return;
  const iosTab = isIOSDevice() && !isStandaloneApp();
  const supported = notificationsSupported();
  filter.classList.toggle('hidden', !supported && !iosTab);
  if (!supported && !iosTab) return;
  if (timeInput) {
    timeInput.value = notifySettings.time;
    timeInput.disabled = !notifySettings.enabled || iosTab;
  }
  if (toggle) {
    const denied = notificationPermission() === 'denied';
    toggle.textContent = notifySettings.enabled
      ? 'On'
      : denied ? 'Blocked' : iosTab ? 'Set up' : 'Off';
    toggle.setAttribute('aria-pressed', notifySettings.enabled ? 'true' : 'false');
  }
}

function setupNotificationEvents() {
  const enable = document.getElementById('notifyEnable');
  const dismiss = document.getElementById('notifyDismiss');
  const toggle = document.getElementById('reminderToggle');
  const timeInput = document.getElementById('reminderTime');
  if (enable) enable.addEventListener('click', handleNotifyEnable);
  if (dismiss) dismiss.addEventListener('click', handleNotifyDismiss);
  if (toggle) toggle.addEventListener('click', handleReminderToggle);
  if (timeInput) timeInput.addEventListener('change', handleReminderTimeChange);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkReminder();
  });
  window.addEventListener('focus', checkReminder);
  window.addEventListener('pageshow', checkReminder);
  window.addEventListener('storage', e => {
    if (e.key !== NOTIFY_KEY) return;
    notifySettings = loadNotifySettings();
    updateNotifyUi();
    if (notifySettings.enabled || notifySettings.dismissed) hideNotifyPrompt();
    if (notifySettings.enabled) {
      ensureReminderTimer();
      checkReminder();
    } else {
      clearReminderTimer();
    }
  });
}

function initNotifications() {
  registerNotificationServiceWorker();
  if (!notificationsInitialized) {
    notificationsInitialized = true;
    reconcileNotifySettings();
    updateNotifyUi();
    maybeShowFirstRunPrompt();
  }
  if (notifySettings.enabled) {
    ensureReminderTimer();
    checkReminder();
  }
}
