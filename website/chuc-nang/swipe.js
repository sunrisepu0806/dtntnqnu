// Một lần vuốt ngang đổi một ảnh; bỏ qua chạm nhẹ, cuộn dọc và nhiều ngón.
export function bindPhotoSwipe(surface, onStep) {
  let start = null;
  const pointers = new Set();
  const reset = () => { start = null; pointers.clear(); };
  surface.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointers.add(event.pointerId);
    if (pointers.size !== 1) { start = null; return; }
    start = { id: event.pointerId, x: event.clientX, y: event.clientY };
    surface.setPointerCapture?.(event.pointerId);
  });
  surface.addEventListener('pointerup', event => {
    const origin = start;
    start = null;
    pointers.delete(event.pointerId);
    if (!origin || origin.id !== event.pointerId || pointers.size) return;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    if (Math.abs(dx) >= 45 && Math.abs(dx) > Math.abs(dy) * 1.5) onStep(dx < 0 ? 1 : -1);
  });
  surface.addEventListener('pointercancel', event => { pointers.delete(event.pointerId); start = null; });
  surface.addEventListener('lostpointercapture', () => { start = null; });
  return reset;
}
