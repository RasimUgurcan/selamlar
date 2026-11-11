// Kareleri headless Chromium'da render eder, sesi sentezler, MP4'e çevirir.
//   node render.mjs                     -> tüm video: out/kufi-mg.mp4
//   node render.mjs --kareler 60,140    -> yalnızca bu karelerin görselleri: out/kare_0060.png ...
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright'); // global kurulum (NODE_PATH) de bulunur
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'out');
const args = process.argv.slice(2);
const stills = args.includes('--kareler') ? args[args.indexOf('--kareler') + 1].split(',').map(Number) : null;
const PY = process.env.PYTHON || 'python3';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('SAYFA HATASI:', e.message));
await page.goto(`http://127.0.0.1:${port}/index.html`);
await page.waitForFunction(() => window.ready === true, null, { timeout: 60000 });
const total = await page.evaluate(() => window.TOTAL_FRAMES);
const fps = await page.evaluate(() => window.FPS);
fs.mkdirSync(OUT, { recursive: true });

const t0 = Date.now();
if (stills) {
  const last = Math.max(...stills);
  for (let f = 0; f <= last; f++) {
    const want = stills.includes(f);
    await page.evaluate(([fr, d]) => window.renderFrame(fr, d), [f, want]);
    if (want) {
      const file = path.join(OUT, `kare_${String(f).padStart(4, '0')}.png`);
      await page.screenshot({ path: file });
      console.log('görsel:', file);
    }
  }
} else {
  const dir = path.join(OUT, 'kareler');
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  for (let f = 0; f < total; f++) {
    await page.evaluate((fr) => window.renderFrame(fr), f);
    await page.screenshot({ path: path.join(dir, `${String(f).padStart(5, '0')}.png`) });
    if (f % 30 === 0) console.log(`kare ${f}/${total}  (${((Date.now() - t0) / 1000).toFixed(0)} sn)`);
  }
  const cues = await page.evaluate(() => window.cues);
  fs.writeFileSync(path.join(OUT, 'cues.json'), JSON.stringify({ duration: total / fps, cues }, null, 1));
  execFileSync(PY, [path.join(ROOT, 'audio.py'), path.join(OUT, 'cues.json'), path.join(OUT, 'ses.wav')], { stdio: 'inherit' });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(dir, '%05d.png'),
    '-i', path.join(OUT, 'ses.wav'), '-c:v', 'libx264', '-crf', '16', '-preset', 'slow', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', path.join(OUT, 'kufi-mg.mp4')], { stdio: 'inherit' });
  console.log('Hazır:', path.join(OUT, 'kufi-mg.mp4'));
}
console.log(`süre: ${((Date.now() - t0) / 1000).toFixed(0)} sn`);
await browser.close();
server.close();
