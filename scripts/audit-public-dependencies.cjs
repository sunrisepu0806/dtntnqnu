const fs = require('node:fs');
const origin = 'https://doithanhnientinhnguyenqnu.io.vn';
(async () => {
  const paths = ['/', '/tracuudiemdanh', '/thanh-tich', '/nhat-ky', '/dang-ky', '/hoat-dong'];
  const scripts = new Set();
  for (const path of paths) {
    const response = await fetch(origin + path);
    const html = await response.text();
    for (const match of html.matchAll(/<script[^>]+src="([^"]+)"/g)) scripts.add(new URL(match[1], origin).href);
  }
  fs.mkdirSync('audit/public-current', { recursive: true });
  for (const url of scripts) {
    const text = await (await fetch(url)).text();
    const filename = new URL(url).pathname.split('/').pop();
    fs.writeFileSync('audit/public-current/' + filename, text);
    for (const term of ['"users"', '"attendance"', '"department_tasks"', '"certificates"', '"activity_registrations"', '"qnu_website_counters"']) {
      let position = 0, count = 0;
      while ((position = text.indexOf(term, position)) >= 0 && count++ < 3) {
        console.log(filename, text.slice(Math.max(0, position - 100), position + 180));
        position += term.length;
      }
    }
  }
})().catch(e => { console.error(e.message); process.exit(1); });
