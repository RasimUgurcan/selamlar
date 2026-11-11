// Kareleri headless Chromium'da render eder, hareket bulanıklığı için alt kareleri
// ortalar, sesi sentezler, MP4'e çevirir ve hareket kalite kontrolü yapar.
//   node render.mjs                      -> out/kufi-jelly.mp4 (4 alt kare, 180° obtüratör)
//   node render.mjs --bulaniklik 1       -> bulanıklık olmadan, hızlı
//   node render.mjs --kareler 40,75,110  -> yalnızca bu karelerin görselleri
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'out');
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const stills = args.includes('--kareler') ? opt('--kareler').split(',').map(Number) : null;
const SUB = Number(opt('--bulaniklik', 4));   // alt kare sayısı
const SHUTTER = 0.5;                           // 180° obtüratör
const PY = process.env.PYTHON || 'python3';
const NAME = 'kufi-jelly';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  const real = fs.existsSync(p) ? fs.realpathSync(p) : null;
  if (!real || fs.statSync(real).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(real).pipe(res);
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('SAYFA HATASI:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('KONSOL:', m.text()); });
await page.goto(`http://127.0.0.1:${port}/index.html`);
await page.waitForFunction(() => window.ready === true, null, { timeout: 120000 });
const total = await page.evaluate(() => window.TOTAL_FRAMES);
const fps = await page.evaluate(() => window.FPS);
fs.mkdirSync(OUT, { recursive: true });
const t0 = Date.now();

if (stills) {
  for (const f of [...stills].sort((a, b) => a - b)) {
    await page.evaluate((fr) => window.renderAt(fr / window.FPS), f);
    const file = path.join(OUT, `kare_${String(f).padStart(4, '0')}.png`);
    await page.screenshot({ path: file });
    console.log('görsel:', file);
  }
} else {
  const dir = path.join(OUT, 'kareler');
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  let n = 0;
  for (let f = 0; f < total; f++) {
    for (let k = 0; k < SUB; k++) {
      const t = (f + (SUB > 1 ? (k / SUB) * SHUTTER : 0)) / fps;
      await page.evaluate((tt) => window.renderAt(tt), t);
      await page.screenshot({ path: path.join(dir, `${String(n++).padStart(6, '0')}.png`) });
    }
    if (f % 30 === 0) console.log(`kare ${f}/${total}  (${((Date.now() - t0) / 1000).toFixed(0)} sn)`);
  }
  const cues = await page.evaluate(() => window.cues);
  fs.writeFileSync(path.join(OUT, 'cues.json'), JSON.stringify({ duration: total / fps, cues }, null, 1));
  execFileSync(PY, [path.join(ROOT, 'audio.py'), path.join(OUT, 'cues.json'), path.join(OUT, 'ses.wav')], { stdio: 'inherit' });
  const vf = SUB > 1 ? `tmix=frames=${SUB},select='not(mod(n\\,${SUB}))',setpts=N/${fps}/TB` : 'null';
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps * SUB), '-i', path.join(dir, '%06d.png'),
    '-i', path.join(OUT, 'ses.wav'), '-vf', vf, '-r', String(fps), '-c:v', 'libx264', '-crf', '16', '-preset', 'slow',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', path.join(OUT, `${NAME}.mp4`)], { stdio: 'inherit' });
  console.log('Hazır:', path.join(OUT, `${NAME}.mp4`));
}
console.log(`süre: ${((Date.now() - t0) / 1000).toFixed(0)} sn`);
await browser.close();
server.close();
