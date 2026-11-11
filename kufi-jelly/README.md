# Kufi Jelly: "Softness 1/10 → 10/10"

Jöle küp serisi. Kufi, ışığı kıran bir jöle küp olarak kaideye düşer; her çekimde yumuşaklık artar.
Görüntü tarayıcıda Three.js ile çizilir. Yumuşak cisim fiziği kodla hesaplanır: şekil eşleme, hacim
koruma ve yüzey pürüzsüzlüğü. Ses de kodla sentezlenir.

```bash
npm install                                   # three.js (kufi-mg ile ortak)
node render.mjs --kareler 64,169,274          # hızlı görseller -> out/kare_XXXX.png
node render.mjs                               # tam video, 4 alt kare hareket bulanıklığı -> out/kufi-jelly.mp4
python qa.py out/kufi-jelly.mp4               # donma tespiti + hareket grafiği
```

- **Müzik saattir:** 120 BPM, her çekim 7 vuruş, çarpma 2. vuruşta. Düşüş süresi fizikten geriye hesaplanır.
- **Fizik ayarları:** `main.js` başındaki `SHOTS`. `shape` (şekil koruma) ve `edge` (kenar sertliği) düştükçe jöle yumuşar.
