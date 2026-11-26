const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');
const { createRecentAccess, accessKey } = load('lib/recent-access.ts');

test('a passed access check is trusted only until its TTL runs out', () => {
  let now = 1000;
  const access = createRecentAccess(120000, () => now);
  const key = accessKey('sid', 'activity', 's1', '');
  assert.equal(access.has(key), false);
  access.add(key);
  now += 119999; assert.equal(access.has(key), true);
  now += 1; assert.equal(access.has(key), false, 'expired after exactly the TTL');
});

test('keys differ per login session, activity, session and password', () => {
  const base = accessKey('sid', 'a', 's1', 'pw');
  for (const other of [accessKey('sid2', 'a', 's1', 'pw'), accessKey('sid', 'b', 's1', 'pw'), accessKey('sid', 'a', 's2', 'pw'), accessKey('sid', 'a', 's1', 'other'), accessKey('sid', 'a', 's1', undefined)])
    assert.notEqual(other, base);
  assert.equal(base.includes('pw'), false, 'password is hashed, not kept in clear');
});

test('the cache stays bounded', () => {
  const access = createRecentAccess(60000, () => 0, 3);
  for (const k of ['a', 'b', 'c']) access.add(k);
  access.add('d');
  assert.deepEqual(['a', 'b', 'c', 'd'].map(k => access.has(k)), [false, false, false, true]);
});
