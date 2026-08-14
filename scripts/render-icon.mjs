// 用 sharp 把 icon-source.svg 光栅化为 build/icon.png（512x512）
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, 'build', 'icon-source.svg');
const out = path.join(root, 'build', 'icon.png');

await sharp(src, { density: 72 }).resize(512, 512).png().toFile(out);
console.log('icon written:', out);
