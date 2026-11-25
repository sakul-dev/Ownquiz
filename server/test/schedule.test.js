import test from 'node:test';
import assert from 'node:assert/strict';
import { nextOccurrence, isValidTime, isValidTimeZone } from '../src/schedule.js';

const iso = ms => new Date(ms).toISOString();

test('returns the same day when the reminder time is still ahead', () => {
  const from = Date.parse('2026-01-15T10:00:00Z');
  assert.equal(iso(nextOccurrence('18:00', 'Europe/Berlin', from)), '2026-01-15T17:00:00.000Z');
});

test('returns the next day when the reminder time has passed', () => {
  const from = Date.parse('2026-01-15T18:00:00Z');
  assert.equal(iso(nextOccurrence('18:00', 'Europe/Berlin', from)), '2026-01-16T17:00:00.000Z');
});

test('handles negative UTC offsets', () => {
  const from = Date.parse('2026-07-01T12:00:00Z');
  assert.equal(iso(nextOccurrence('18:00', 'America/New_York', from)), '2026-07-01T22:00:00.000Z');
});

test('handles half-hour offsets', () => {
  const from = Date.parse('2026-01-01T00:00:00Z');
  assert.equal(iso(nextOccurrence('09:00', 'Asia/Kolkata', from)), '2026-01-01T03:30:00.000Z');
});

test('crosses the spring DST transition', () => {
  const from = Date.parse('2026-03-28T17:00:00Z');
  assert.equal(iso(nextOccurrence('18:00', 'Europe/Berlin', from)), '2026-03-29T16:00:00.000Z');
});

test('crosses the autumn DST transition', () => {
  const from = Date.parse('2026-10-24T16:00:00Z');
  assert.equal(iso(nextOccurrence('18:00', 'Europe/Berlin', from)), '2026-10-25T17:00:00.000Z');
});

test('always returns a future timestamp within 25 hours', () => {
  const zones = ['UTC', 'Europe/Berlin', 'America/New_York', 'Asia/Kolkata', 'Australia/Lord_Howe', 'Pacific/Chatham'];
  for (const zone of zones) {
    for (let day = 0; day < 366; day += 5) {
      const from = Date.parse('2026-01-01T00:00:00Z') + day * 24 * 60 * 60 * 1000;
      const next = nextOccurrence('18:00', zone, from);
      assert.ok(next > from, zone + ' day ' + day + ' returned a past timestamp');
      assert.ok(next - from <= 25 * 60 * 60 * 1000, zone + ' day ' + day + ' returned a too distant timestamp');
    }
  }
});

test('validates reminder times', () => {
  assert.equal(isValidTime('18:00'), true);
  assert.equal(isValidTime('00:00'), true);
  assert.equal(isValidTime('23:59'), true);
  assert.equal(isValidTime('24:00'), false);
  assert.equal(isValidTime('8:00'), false);
  assert.equal(isValidTime('18:60'), false);
  assert.equal(isValidTime(null), false);
});

test('validates time zones', () => {
  assert.equal(isValidTimeZone('Europe/Berlin'), true);
  assert.equal(isValidTimeZone('UTC'), true);
  assert.equal(isValidTimeZone('Not/AZone'), false);
  assert.equal(isValidTimeZone(''), false);
  assert.equal(isValidTimeZone(null), false);
});
