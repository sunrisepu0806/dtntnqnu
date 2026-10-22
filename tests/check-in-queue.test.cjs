const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');
const { CheckInQueue } = load('lib/check-in-queue.ts');
const tick = () => new Promise(resolve => setImmediate(resolve));
test('300 members are drained with at most three in flight and repeated scans ignored', async () => {
  let active = 0, peak = 0, calls = 0;
  const q = new CheckInQueue(async value => { active++; calls++; peak = Math.max(peak, active); await tick(); active--; return { alreadyCheckedIn: value === 10 }; }, () => {});
  for (let i = 0; i < 300; i++) { assert.equal(q.enqueue(String(i), i), 'accepted'); assert.equal(q.enqueue(String(i), i), 'duplicate'); }
  for (let i = 0; i < 500 && q.snapshot().some(x => ['saving', 'queued'].includes(x.state)); i++) await tick();
  assert.equal(calls, 300); assert.equal(peak, 3);
  assert.equal(q.snapshot().filter(x => x.state === 'saved').length, 299);
  assert.equal(q.snapshot().filter(x => x.state === 'duplicate').length, 1);
});
test('a lost acknowledgement stays failed until an explicit safe retry', async () => {
  let calls = 0;
  const q = new CheckInQueue(async () => { if (++calls === 1) throw Error('Lost response'); return { alreadyCheckedIn: true }; }, () => {});
  q.enqueue('a', 'a'); await tick();
  assert.equal(q.snapshot()[0].state, 'failed'); assert.equal(q.snapshot()[0].error, 'Lost response');
  q.retryFailed(); await tick(); assert.equal(q.snapshot()[0].state, 'duplicate'); assert.equal(calls, 2);
});
test('bounded queue rejects extra members without dropping accepted ones', async () => {
  const q = new CheckInQueue(async () => ({ alreadyCheckedIn: false }), () => {}, 3, 2);
  q.enqueue('a', 'a'); q.enqueue('b', 'b'); assert.equal(q.enqueue('c', 'c'), 'full'); await tick(); assert.equal(q.snapshot().length, 2);
});

test('pending approval is never shown as saved and does not resubmit on retryFailed', async () => {
  let calls=0;const q=new CheckInQueue(async()=>{calls++;return {alreadyCheckedIn:false,pendingApproval:true};},()=>{});
  q.enqueue('a','a');await tick();assert.equal(q.snapshot()[0].state,'pending');
  q.retryFailed();await tick();assert.equal(calls,1);
});
