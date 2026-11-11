// Moodboard panolarını üretir: node pano.mjs  -> out/moodboard_A.png ... (önce kare.mjs)
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
}).listen(0);
const browser = await chromium.launch();
for (const k of ['A', 'B', 'C', 'D']) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${server.address().port}/board.html?k=${k}`);
  await page.waitForFunction(() => window.ready === true);
  await page.screenshot({ path: path.join(ROOT, 'out', `moodboard_${k}.png`) });
  console.log('pano:', `out/moodboard_${k}.png`); await page.close();
}
await browser.close(); server.close();
