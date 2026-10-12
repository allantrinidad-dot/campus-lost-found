const test = require('node:test');
const assert = require('node:assert/strict');
const { isExpired } = require('./expiration.js');

const today = new Date('2026-10-06T12:00:00');
const itemPostedDaysAgo = days => ({ date: new Date(today.getTime() - days * 86400000).toISOString() });

test('an item posted 29 days ago has not expired', () => {
  assert.equal(isExpired(itemPostedDaysAgo(29), today), false);
});

test('an item posted 30 days ago has expired', () => {
  assert.equal(isExpired(itemPostedDaysAgo(30), today), true);
});

test('an item posted 31 days ago has expired', () => {
  assert.equal(isExpired(itemPostedDaysAgo(31), today), true);
});

test('an item with a future posting date has not expired', () => {
  assert.equal(isExpired({ date: '2026-10-07' }, today), false);
});

test('an item with no posting date has not expired', () => {
  assert.equal(isExpired({}, today), false);
});

test('an empty item has not expired', () => {
  assert.equal(isExpired(null, today), false);
});

test('an item with an invalid posting date has not expired', () => {
  assert.equal(isExpired({ date: 'not-a-date' }, today), false);
});

test('an invalid current date does not mark an item expired', () => {
  assert.equal(isExpired({ date: '2026-09-01' }, 'not-a-date'), false);
});
