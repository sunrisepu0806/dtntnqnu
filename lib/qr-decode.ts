// Fallback QR decoding for codes the default scanner misses: inverted codes
// (light modules on a dark background) and coloured codes whose contrast is
// stronger in one colour channel than in plain luminance.
// ZXing is passed in so this stays a pure, testable function.

/* eslint-disable @typescript-eslint/no-explicit-any */
type ZXingModule = any;

export function luminanceVariants(rgba: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray[] {
  const size = width * height;
  const lum = new Uint8ClampedArray(size);
  const channels = [new Uint8ClampedArray(size), new Uint8ClampedArray(size), new Uint8ClampedArray(size)];
  for (let i = 0; i < size; i++) {
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
    lum[i] = (r * 306 + g * 601 + b * 117) >> 10;
    channels[0][i] = r; channels[1][i] = g; channels[2][i] = b;
  }
  // The channel with the widest spread separates modules from background best.
  const spread = (data: Uint8ClampedArray) => {
    let sum = 0, sq = 0;
    for (let i = 0; i < size; i += 7) { sum += data[i]; sq += data[i] * data[i]; }
    const n = Math.ceil(size / 7), mean = sum / n;
    return sq / n - mean * mean;
  };
  const best = channels.reduce((a, b) => (spread(b) > spread(a) ? b : a));
  return [lum, best];
}

export type ScanWindow = { cx: number; cy: number; side: number };

/**
 * Square windows to scan, most likely first. A whole-frame pass fails when a
 * small inverted code sits next to a bright card and busy background, so the
 * frame is also read in overlapping halves and thirds.
 */
export function scanWindows(width: number, height: number): ScanWindow[] {
  const short = Math.min(width, height);
  const windows: ScanWindow[] = [
    { cx: width / 2, cy: height / 2, side: short * 0.75 },
    { cx: width / 2, cy: height / 2, side: short * 0.45 },
  ];
  for (const fraction of [0.55, 0.38]) {
    const side = short * fraction;
    const xs = [side / 2, width / 2, width - side / 2], ys = [side / 2, height / 2, height - side / 2];
    for (const cy of ys) for (const cx of xs) if (!(cx === width / 2 && cy === height / 2)) windows.push({ cx, cy, side });
  }
  return windows;
}

/** Try luminance and best channel, each as is and inverted. Returns the text or null. */
export function decodeQrPixels(ZX: ZXingModule, rgba: Uint8ClampedArray, width: number, height: number, includePlain = true): string | null {
  const hints = new Map<unknown, unknown>([
    [ZX.DecodeHintType.POSSIBLE_FORMATS, [ZX.BarcodeFormat.QR_CODE]],
    [ZX.DecodeHintType.TRY_HARDER, true],
  ]);
  const reader = new ZX.MultiFormatReader();
  const [lum, best] = luminanceVariants(rgba, width, height);
  const sources: unknown[] = [];
  for (const data of [lum, best]) {
    const source = new ZX.RGBLuminanceSource(data, width, height);
    if (includePlain || data !== lum) sources.push(source);
    sources.push(new ZX.InvertedLuminanceSource(source));
  }
  for (const source of sources) {
    try { return reader.decode(new ZX.BinaryBitmap(new ZX.HybridBinarizer(source)), hints).getText(); }
    catch { /* try the next variant */ }
  }
  return null;
}
