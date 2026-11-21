/**
 * 生成 PWA 图标（纯 Node，零依赖）。
 *
 * 为什么不引 sharp / canvas：图标是构建期一次性产物，为它引入二进制依赖不划算。
 * 光栅化逻辑在 scripts/lib/icon-raster.mjs，几何正确性由 scripts/check-icons.mjs 把关。
 *
 * 产出（apps/web/public/icons/）：
 *   icon-192.png          —— manifest icons，purpose=any
 *   icon-512.png          —— manifest icons，purpose=any（Chrome 安装对话框要求 ≥144px PNG）
 *   icon-maskable-512.png —— purpose=maskable（Android 自适应图标，内容须落在中心 80% 圆内）
 *   apple-touch-icon.png  —— iOS 添加到主屏幕，180x180，不透明方形（iOS 自己加圆角）
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderIcon } from './lib/icon-raster.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, '../apps/web/public/icons');

const targets = [
  { file: 'icon-192.png', size: 192, radius: 0.22, glyph: 0.78 },
  { file: 'icon-512.png', size: 512, radius: 0.22, glyph: 0.78 },
  // maskable：内容必须落在中心 80% 圆内，故字形缩到 0.6、背景满幅
  { file: 'icon-maskable-512.png', size: 512, radius: 0, glyph: 0.6 },
  // iOS 会自己裁圆角，图标需满幅不透明
  { file: 'apple-touch-icon.png', size: 180, radius: 0, glyph: 0.78 },
];

mkdirSync(OUT_DIR, { recursive: true });

for (const t of targets) {
  const png = renderIcon(t.size, t.radius, t.glyph);
  writeFileSync(resolve(OUT_DIR, t.file), png);
  console.log(`✓ ${t.file}  ${t.size}x${t.size}  ${(png.length / 1024).toFixed(1)} KB`);
}
