import test from 'node:test';
import assert from 'node:assert/strict';
import { bindPhotoSwipe } from '../chuc-nang/swipe.js';
function setup() {
  const target = new EventTarget(), steps = [];
  const reset = bindPhotoSwipe(target, n => steps.push(n));
  const send = (type, x, y, id = 1) => {
    const event = new Event(type);
    Object.assign(event, { clientX:x, clientY:y, pointerId:id, pointerType:'touch' });
    target.dispatchEvent(event);
  };
  return { send, steps, reset };
}
test('left and right swipes each change one image', () => {
  const {send, steps} = setup();
  send('pointerdown',250,100); send('pointerup',70,115);
  send('pointerdown',70,100); send('pointerup',250,115);
  assert.deepEqual(steps,[1,-1]);
});
test('taps, short drags, vertical scroll and cancellation do not change images', () => {
  const {send, steps} = setup();
  for(const [x,y] of [[100,100],[125,105],[200,300]]) {
    send('pointerdown',100,100); send('pointerup',x,y);
  }
  send('pointerdown',250,100); send('pointercancel',100,100); send('pointerup',0,100);
  assert.deepEqual(steps,[]);
});
test('pinch and closing the viewer cancel the gesture', () => {
  const {send, steps, reset} = setup();
  send('pointerdown',250,100,1); send('pointerdown',100,100,2);
  send('pointerup',0,100,1); send('pointerup',300,100,2);
  send('pointerdown',250,100); reset(); send('pointerup',0,100);
  assert.deepEqual(steps,[]);
});
