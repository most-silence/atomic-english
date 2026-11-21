/**
 * 图标几何自检：把光栅化结果打成 ASCII，直接肉眼确认字形是否正确。
 * 写图标时容易把"外三角形减内三角形"写反或漏掉横杠，这个脚本能在生成 PNG 之前拦下来。
 */
import { rasterizeIcon, glyphA } from './lib/icon-raster.mjs';

const size = 48;
const rgba = rasterizeIcon(size, 0.22, 0.78);

const rows = [];
for (let y = 0; y < size; y++) {
  let line = '';
  for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    // 前景色接近白色即视为字形像素
    line += rgba[i] > 200 && rgba[i + 1] > 200 && rgba[i + 2] > 200 ? '#' : ' ';
  }
  rows.push(line);
}
console.log(rows.join('\n'));

// 前景像素占比
const ink = rows.join('').split('').filter((c) => c === '#').length;
const ratio = ink / (size * size);
console.log(`\n前景像素占比: ${(ratio * 100).toFixed(1)}%`);

// 左右对称性
let asym = 0;
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    if (rows[y][x] === '#' && rows[y][size - 1 - x] !== '#') asym++;
  }
}
console.log(`左右不对称像素: ${asym}`);

// 关键横切线断言
const probe = (nx, ny) => glyphA(nx, ny, 0.78);
const checks = [
  ['顶部三角实心', probe(0.5, 0.28), true],
  ['中部镂空（字洞）', probe(0.5, 0.5), false],
  ['横杠实心', probe(0.5, 0.61), true],
  ['底部镂空', probe(0.5, 0.75), false],
  ['左腿有字形', probe(0.35, 0.68), true],
  ['右腿有字形', probe(0.65, 0.68), true],
  ['两腿之间是字洞', probe(0.5, 0.68), false],
  ['三角外无字形', probe(0.1, 0.1), false],
];

let failed = 0;
for (const [name, actual, expected] of checks) {
  const ok = actual === expected;
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}（期望 ${expected}，实际 ${actual}）`);
}
if (ratio < 0.05 || ratio > 0.2) {
  console.log(`✗ 前景占比异常（${(ratio * 100).toFixed(1)}%），字形可能写坏了`);
  failed++;
}
if (asym > size) {
  console.log(`✗ 左右不对称像素过多（${asym}），字形可能写坏了`);
  failed++;
}
process.exit(failed ? 1 : 0);
