# Kufi MG: motion graphics tarzında Short üretici

"Face 1 → 10,000" kumaş testi; cesur renkler, kinetik tipografi ve ifadeli bir karakterle.
Görüntü tarayıcıda Three.js ile çizilir, kumaş fiziği kodla hesaplanır, ses kodla sentezlenir.

```bash
npm install                                  # three.js
node render.mjs                              # tam video -> out/kufi-mg.mp4 (1080x1920, sesli)
node render.mjs --kareler 70,200,330         # yalnızca bu karelerin görselleri -> out/kare_XXXX.png
```

Gerekenler: Node.js, Playwright (Chromium), ffmpeg, Python + numpy (ses için; `PYTHON=` ile yol verilebilir).

| Dosya | İçerik |
|---|---|
| `main.js` | Sahne, "Kufi" karakteri, kumaş fiziği (PBD), zaman çizelgesi, geçişler, HUD |
| `index.html` | Tipografi katmanları (sayaç, dev arka plan rakamı, başlıklar) |
| `render.mjs` | Kareleri sırayla render eder, sesi üretir, MP4'e çevirir |
| `audio.py` | 141 BPM müzik altlığı + geçiş/çarpma/pop efektleri (simülasyondaki temas anına senkron) |

Renkleri, yüz sayılarını ve süreleri `main.js` başındaki `SHOTS` listesinden değiştir.
