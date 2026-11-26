const { test } = require('node:test');
const assert = require('node:assert/strict');
const QRCode = require('qrcode');
const ZX = require('html5-qrcode/third_party/zxing-js.umd.js');
const { load } = require('./helpers.cjs');
const { normalizeScanCode } = load('lib/scan-code.ts');
const { decodeQrPixels } = load('lib/qr-decode.ts');

const ID = '4751180032';
const rgb = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
function render(text, fg, bg, scale = 5, margin = 4) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size, size = (n + margin * 2) * scale;
  const px = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const mx = Math.floor(x / scale) - margin, my = Math.floor(y / scale) - margin;
    const dark = mx >= 0 && my >= 0 && mx < n && my < n && qr.modules.get(my, mx);
    px.set([...rgb(dark ? fg : bg), 255], (y * size + x) * 4);
  }
  return [px, size, size];
}

test('scanned text is reduced to the MSSV it carries', () => {
  for (const [raw, want] of [
    [ID, ID], [` ${ID}\r\n`, ID], ['﻿' + ID + '​', ID],
    ['MSSV: ' + ID, ID], ['Nguyễn Văn A | ' + ID, ID],
    ['https://qnu.edu.vn/sv?mssv=' + ID, ID], ['https://x.vn/the/' + ID, ID],
    ['member-abc123', 'member-abc123'],
  ]) assert.equal(normalizeScanCode(raw), want, JSON.stringify(raw));
  // Two different numbers: ambiguous, keep the text so the server rejects it clearly.
  assert.equal(normalizeScanCode('4751180032 4851020071'), '4751180032 4851020071');
});

test('inverted and coloured QR codes decode to the same MSSV', () => {
  for (const [fg, bg] of [
    ['#000000', '#ffffff'], ['#ffffff', '#000000'], ['#ffffff', '#1d4ed8'], ['#facc15', '#ffffff'],
    ['#ffffff', '#dc2626'], ['#dc2626', '#16a34a'], ['#f9a8d4', '#7e22ce'],
  ]) assert.equal(decodeQrPixels(ZX, ...render(ID, fg, bg)), ID, `${fg} on ${bg}`);
});

test('a small inverted code off-centre in a large frame is found by the scan windows', () => {
  const { scanWindows } = load('lib/qr-decode.ts');
  const W = 960, H = 720, [code, size] = render(ID, '#e2e8f5', '#1e3c96', 4, 4);
  const frame = new Uint8ClampedArray(W * H * 4);
  let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < W * H; i++) frame.set([170 + rnd() * 25, 160 + rnd() * 25, 140 + rnd() * 25, 255], i * 4);
  const x0 = 760, y0 = 540; // lower-right corner, outside the central windows
  for (let y = 0; y < size; y++) frame.set(code.subarray(y * size * 4, (y + 1) * size * 4), ((y0 + y) * W + x0) * 4);
  const cropTo = ({ cx, cy, side }, out) => {
    const k = Math.min(1, out / side), n = Math.floor(side * k), dst = new Uint8ClampedArray(n * n * 4);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const sx = Math.min(W - 1, Math.max(0, Math.floor(cx - side / 2 + x / k))), sy = Math.min(H - 1, Math.max(0, Math.floor(cy - side / 2 + y / k)));
      dst.set(frame.subarray((sy * W + sx) * 4, (sy * W + sx) * 4 + 4), (y * n + x) * 4);
    }
    return [dst, n, n];
  };
  const found = scanWindows(W, H).map(w => decodeQrPixels(ZX, ...cropTo(w, 640))).find(Boolean);
  assert.equal(found, ID);
});
