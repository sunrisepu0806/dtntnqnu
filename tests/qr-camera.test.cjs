const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');
const { cameraFailure, startWithCameraFallback } = load('lib/qr-camera.ts');

test('camera failures distinguish permission, missing device and busy device', () => {
  assert.match(cameraFailure({name:'NotAllowedError'}), /đang bị chặn/);
  assert.match(cameraFailure('NotFoundError: no device'), /Không tìm thấy/);
  assert.match(cameraFailure({name:'NotReadableError'}), /đang bận/);
});
test('rear camera failure falls back to front camera', async () => {
  const calls=[];
  await startWithCameraFallback(async facing => { calls.push(facing); if(facing==='environment')throw {name:'OverconstrainedError'}; },()=>false);
  assert.deepEqual(calls,['environment','user']);
});
test('permission denial and cancellation never request another camera', async () => {
  for(const [error,cancelled] of [[{name:'NotAllowedError'},false],[{name:'NotFoundError'},true]]) {
    const calls=[];
    await assert.rejects(startWithCameraFallback(async facing=>{calls.push(facing);throw error;},()=>cancelled));
    assert.deepEqual(calls,['environment']);
  }
});
