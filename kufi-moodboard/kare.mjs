// Moodboard ana karelerini render eder: node kare.mjs A B C D  -> out/kare_A.png ...
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'out');
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  const real = fs.existsSync(p) ? fs.realpathSync(p) : null;
  if (!real || fs.statSync(real).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(real).pipe(res);
}).listen(0);
const port = server.address().port;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const which = process.argv.slice(2).length ? process.argv.slice(2) : ['A', 'B', 'C', 'D'];
for (const s of which) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error(s, 'SAYFA HATASI:', e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html?s=${s}`);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 180000 });
  await page.screenshot({ path: path.join(OUT, `kare_${s}.png`) });
  console.log('görsel:', path.join(OUT, `kare_${s}.png`));
  await page.close();
}
await browser.close();
server.close();
