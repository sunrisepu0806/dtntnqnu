(() => {
  const button = document.querySelector('#interest-button');
  const count = document.querySelector('#interest-count');
  const status = document.querySelector('#interest-status');
  const baseCount = Number(button.dataset.baseCount || 0);
  let loaded = false;
  let busy = false;
  let refreshTimer;
  // Mã này chỉ giúp nhận diện trình duyệt; số lượt luôn đọc từ máy chủ.
  let id;
  try { id = localStorage.getItem('qnu-visitor'); } catch {}
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) id = crypto.randomUUID();
  try { localStorage.setItem('qnu-visitor', id); } catch {}
  function display(data) {
    if (!Number.isSafeInteger(data.count) || data.count < 0) throw new Error('Invalid count');
    loaded = true;
    count.textContent = new Intl.NumberFormat('vi-VN').format(baseCount + data.count);
    button.disabled = data.interested;
    button.setAttribute('aria-pressed', String(data.interested));
    button.querySelector('.interest-action').textContent = data.interested ? 'Đã quan tâm' : 'Quan tâm';
    status.textContent = data.interested ? 'Cảm ơn bạn đã đồng hành cùng Đội!' : 'Chạm để gửi sự quan tâm · Tổng lượt được cập nhật trực tiếp';
  }
  async function refresh() {
    if (document.hidden || busy) return;
    try {
      const response = await fetch('/api/interest', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      display(await response.json());
    } catch { status.textContent = loaded ? 'Đang kết nối lại · Hiển thị tổng cập nhật gần nhất.' : '2.352 lượt có sẵn · Chưa tải được lượt mới.'; }
  }
  button.addEventListener('click', async () => {
    if (busy) return;
    busy = true; button.disabled = true;
    status.textContent = 'Đang ghi nhận lượt quan tâm…';
    try {
      const response = await fetch('/api/interest', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ visitorId: id }) });
      if (!response.ok) throw new Error();
      display(await response.json());
    } catch { button.disabled = false; status.textContent = 'Chưa lưu được. Bạn hãy bấm thử lại nhé.'; }
    finally { busy = false; }
  });
  refresh();
  // Cập nhật mọi trang đang mở trong tối đa khoảng 3 giây, không tăng số giả.
  refreshTimer = setInterval(refresh, 3000);
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('pagehide', () => clearInterval(refreshTimer));
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) { refresh(); refreshTimer = setInterval(refresh, 3000); }
  });
})();
