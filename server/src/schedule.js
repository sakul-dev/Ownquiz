const formatterCache = new Map();

function formatterFor(timeZone) {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

export function isValidTime(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function isValidTimeZone(value) {
  if (typeof value !== 'string' || !value) return false;
  try {
    formatterFor(value);
    return true;
  } catch (error) {
    return false;
  }
}

export function zonedParts(date, timeZone) {
  const parts = {};
  for (const part of formatterFor(timeZone).formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

export function timeZoneOffsetMs(date, timeZone) {
  const parts = zonedParts(date, timeZone);
  const wallMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const utcMs = Math.floor(date.getTime() / 1000) * 1000;
  return wallMs - utcMs;
}

function wallTimeToUtcMs(year, month, day, hour, minute, timeZone) {
  const wallMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utcMs = wallMs;
  for (let attempt = 0; attempt < 3; attempt++) {
    const offset = timeZoneOffsetMs(new Date(utcMs), timeZone);
    const next = wallMs - offset;
    if (next === utcMs) break;
    utcMs = next;
  }
  return utcMs;
}

export function nextOccurrence(time, timeZone, fromMs = Date.now()) {
  const [hour, minute] = time.split(':').map(Number);
  const local = zonedParts(new Date(fromMs), timeZone);
  let candidate = wallTimeToUtcMs(local.year, local.month, local.day, hour, minute, timeZone);
  if (candidate <= fromMs) {
    const nextDay = new Date(Date.UTC(local.year, local.month - 1, local.day + 1));
    candidate = wallTimeToUtcMs(
      nextDay.getUTCFullYear(),
      nextDay.getUTCMonth() + 1,
      nextDay.getUTCDate(),
      hour,
      minute,
      timeZone
    );
  }
  return candidate;
}
