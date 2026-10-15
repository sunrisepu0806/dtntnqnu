import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function copy(source, target) {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (entry.isDirectory()) copy(join(source, entry.name), join(target, entry.name));
    else copyFileSync(join(source, entry.name), join(target, entry.name));
  }
}
export function build() {
  const template = readFileSync(join(root, 'noi-dung/00-khung-trang.html'), 'utf8');
  const expand = (text, depth = 0) => {
    if (depth > 8) throw new Error('Các tệp INCLUDE đang gọi vòng nhau.');
    return text.replace(/<!-- INCLUDE:([\w-]+) -->/g, (_, name) => expand(readFileSync(join(root, 'noi-dung', `${name}.html`), 'utf8'), depth + 1));
  };
  const html = expand(template);
  const output = join(root, 'dist');
  copy(join(root, 'public'), output);
  copy(join(root, 'noi-dung/trang-hoat-dong'), output);
  copy(join(root, 'giao-dien'), output);
  copy(join(root, 'chuc-nang'), output);
  copyFileSync(join(root, 'du-lieu/bai-facebook.js'), join(output, 'posts-data.js'));
  writeFileSync(join(output, 'index.html'), html);
  console.log('Đã ghép nội dung và tạo website/dist.');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) build();
