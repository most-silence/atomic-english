import { deflateSync } from 'node:zlib';

/**
 * 图标光栅化核心：PNG 编码 + 几何判定。
 * 拆成独立模块是为了能单独跑几何自检（见 scripts/check-icons.mjs）。
 */

/** CRC32 表（PNG 规范附录） */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** RGBA（Buffer，长度 size*size*4）→ PNG 字节流 */
export function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type 0 (None)
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** 圆角矩形内部判定 */
export function insideRoundedRect(px, py, x0, y0, x1, y1, r) {
  if (px < x0 || px > x1 || py < y0 || py > y1) return false;
  const cx = Math.min(Math.max(px, x0 + r), x1 - r);
  const cy = Math.min(Math.max(py, y0 + r), y1 - r);
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

/** 射线法：点是否在多边形内 */
export function insidePolygon(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * "A" 字形几何（归一化 0..1 坐标）。
 * 外三角形减去内三角形 = 两条斜腿；再加一条横杠。
 * 所有坐标先按 scale 绕 (0.5,0.5) 缩放，横杠也必须用缩放后的坐标比较，
 * 否则不同尺寸下横杠位置会漂移。
 */
export function glyphA(x, y, scale) {
  const sx = (px) => 0.5 + (px - 0.5) * scale;
  const sy = (py) => 0.5 + (py - 0.5) * scale;
  const outer = [
    [sx(0.5), sy(0.16)],
    [sx(0.84), sy(0.86)],
    [sx(0.16), sy(0.86)],
  ];
  const inner = [
    [sx(0.5), sy(0.40)],
    [sx(0.635), sy(0.86)],
    [sx(0.365), sy(0.86)],
  ];
  if (!insidePolygon(x, y, outer)) return false;

  // 横杠：用缩放后的坐标判定，并被外三角形裁剪
  const barTop = sy(0.575);
  const barBottom = sy(0.66);
  const barHalf = 0.085 * scale;
  const inBar = y >= barTop && y <= barBottom && Math.abs(x - 0.5) <= barHalf;

  // 内三角形是镂空的"字洞"，但横杠横跨字洞——所以洞在横杠处被填上
  if (insidePolygon(x, y, inner) && !inBar) return false;
  return true;
}

/**
 * 光栅化图标，返回原始 RGBA 缓冲（size*size*4）。
 * 与 renderIcon 分开是为了让几何自检能直接检查像素。
 */
export function rasterizeIcon(size, radiusRatio, glyphScale) {
  const SS = 4; // 4x4 超采样抗锯齿
  const out = Buffer.alloc(size * size * 4);
  const bg = [0x11, 0x11, 0x11];
  const fg = [0xff, 0xff, 0xff];
  const radius = size * radiusRatio;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bgHits = 0;
      let fgHits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          if (!insideRoundedRect(px, py, 0, 0, size, size, radius)) continue;
          bgHits++;
          if (glyphA(px / size, py / size, glyphScale)) fgHits++;
        }
      }
      const total = SS * SS;
      const bgA = bgHits / total;
      const fgA = fgHits / total;
      const i = (y * size + x) * 4;
      out[i] = Math.round(bg[0] * (1 - fgA) + fg[0] * fgA);
      out[i + 1] = Math.round(bg[1] * (1 - fgA) + fg[1] * fgA);
      out[i + 2] = Math.round(bg[2] * (1 - fgA) + fg[2] * fgA);
      out[i + 3] = Math.round(bgA * 255);
    }
  }
  return out;
}

/** 渲染图标为 PNG 字节流 */
export function renderIcon(size, radiusRatio, glyphScale) {
  return encodePng(size, size, rasterizeIcon(size, radiusRatio, glyphScale));
}
