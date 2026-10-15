import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { build, root } from './build.mjs';
import { handleInterest } from '../server/interest.mjs';
const output = resolve(root, 'dist');
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'text/javascript', '.jpg':'image/jpeg', '.png':'image/png', '.woff2':'font/woff2', '.ttf':'font/ttf' };
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/interest') {
    const chunks=[]; let length=0;
    for await (const chunk of req) { length+=chunk.length; if(length>4096){res.writeHead(413).end();return;} chunks.push(chunk); }
    req.body=Buffer.concat(chunks).toString();
    return handleInterest(req,res);
  }
  try {
    if(url.pathname==='/') build(); // Lưu nội dung rồi tải lại trang để xem thay đổi.
    const file=resolve(output, '.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(output+sep)||!existsSync(file)||!statSync(file).isFile()){res.writeHead(404).end('Not found');return;}
    res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.end(readFileSync(file));
  } catch { res.writeHead(500).end('Không tạo được trang. Xem Terminal.'); }
}).listen(5174,'127.0.0.1',()=>console.log('Mở http://127.0.0.1:5174 — sửa nội dung, lưu rồi tải lại trình duyệt.'));
build();
