const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');
const { firebaseConfigurationError } = load('lib/firebase-admin.ts', {
  'server-only': {}, 'firebase-admin/app': {}, 'firebase-admin/auth': {}, 'firebase-admin/firestore': {},
});
test('quota failures explain service exhaustion without exposing raw error details', () => {
  const error = Object.assign(new Error('8 RESOURCE_EXHAUSTED: Quota exceeded. private-project'), { code: 8 });
  const message = firebaseConfigurationError(error);
  assert.match(message, /Firebase đã vượt hạn mức/);
  assert.ok(!message.includes('private-project'));
  assert.match(firebaseConfigurationError({ code: 'resource-exhausted' }), /hạn mức/);
  assert.equal(firebaseConfigurationError(new Error('unrelated')), null);
});
