# selamlar: kodla animasyon kaynakları

YouTube animasyon kanalındaki Shorts videolarının devamını üretmek için toplanmış açık kaynak projeler.

Liste, [@theozguratillay'ın X gönderisinden](https://x.com/theozguratillay/status/2117165062125215871) alındı. Repoların hepsi `kaynaklar/` klasöründe submodule olarak duruyor.

## Kurulum

```bash
git clone https://github.com/rasimugurcan/selamlar.git
cd selamlar
git submodule update --init --depth 1           # hepsini indirir (~1.5 GB)
# ya da yalnızca birini:
git submodule update --init --depth 1 kaynaklar/lemo-opuscar
```

> `mg-styles-15` tek başına ~1.2 GB tutuyor. Gerekmiyorsa onu atlayabilirsin.

Render için Node.js, Google Chrome (veya Chromium), ffmpeg ve Python 3 gerekir.

## Repolar

| # | Klasör | Ne işe yarar | Shorts için |
|---|---|---|---|
| 1 | [`awesome-opus5-5-videos`](https://github.com/yihui-dev/awesome-opus5-5-videos) | Claude Opus 5.5 ile yapılmış videoların arşivi. `prompts/` içinde 700'den fazla prompt var. | Fikir ve prompt bulmak için |
| 2 | [`lemo-opuscar`](https://github.com/lemomo-ai/lemo-opuscar) | 66 hazır film stili. Her stil için `styles/<stil>/STYLE.md` dosyası ve kodla yapılmış bir demo var. Seslendirme, müzik ve render araçları `core/` içinde. | **Ana araç.** `--size 1080x1920` ile dikey render alınabiliyor |
| 3 | [`pdoom-video`](https://github.com/mexicat/pdoom-video) | three.js ile yapılmış müzik videosu: kelime kelime karaoke, ritme oturan sahneler, 4K render | Müzikle senkron Shorts için |
| 4 | [`PDoomVideo`](https://github.com/JohnHeibel/PDoomVideo) | Aynı şarkı için p5.js ve fırça darbeleriyle yapılmış başka bir video. `STORYBOARD.md` ve `ANIMATION_GUIDE.md` dosyaları da var | Sahne geçişleri ve storyboard örneği |
| 5 | [`mg-styles-15`](https://github.com/Vincentwei1021/mg-styles-15) | 15 motion graphics stili. Her biri 10 saniyelik film, prompt ve kaynak kodla geliyor. Müzik `audio.py` ile kodla üretiliyor | Bir stil zaten 9:16. Diğerlerinde prompttaki `Output` satırına 1080×1920 yazmak yetiyor |
| 6 | [`ClaudeAnimationBase`](https://github.com/JohnHeibel/ClaudeAnimationBase) | Çizgi film karakteri animasyonu için başlangıç seti (p5.js + p5.brush): 31 duygu ifadesi, yürüme ve pozlar, `ANIMATION_GUIDE.md` | **Karakterli seriler için.** Kendi karakterini buraya taşıyabilirsin |
| 7 | [`awesome-claude-5-5-videos`](https://github.com/athemeroy/awesome-claude-5-5-videos) | Claude 5.5 videolarının ve nasıl yapıldıklarının derlemesi (424 gönderi) | Araştırma ve örnek |
| 8 | [`opus-video-prompts`](https://github.com/joeseesun/opus-video-prompts) | Doğrudan kullanılabilecek 18 prompt ve 54 örnek (Çince) | Hazır prompt kalıpları |

## Shorts devamı üretmek için önerilen akış

1. **Karakter ve dünya.** Mevcut Shorts'larındaki karakterleri, renkleri ve anlatım tarzını bir `SERI.md` dosyasına yaz. Ekran görüntüleri eklersen daha iyi olur.
2. **Stil seç.**
   - Karakter odaklı çizgi film için: `ClaudeAnimationBase`. Kendi karakterini model sheet olarak buraya taşı.
   - Belirli bir görsel stil için (sulu boya, piksel RPG, 1930'lar kauçuk hortum çizgi filmi, anime gibi): `lemo-opuscar/styles/`.
3. **Dikey format.** 1080×1920 çözünürlükte, 15–60 saniye. lemo-opuscar araçlarına `--size 1080x1920` verilir.
4. **Claude Code'a örnek istek:**
   > `kaynaklar/ClaudeAnimationBase/ANIMATION_GUIDE.md` dosyasını oku. `SERI.md`'deki karakterle bölüm 5'i yap: 9:16, 30 saniye, önce storyboard göster.

## Lisanslar

Repoların çoğu MIT lisanslı. `awesome-claude-5-5-videos` CC BY 4.0 lisanslı. `PDoomVideo` ve `opus-video-prompts` repolarında lisans dosyası yok, bu yüzden kodlarını doğrudan kopyalamak yerine yalnızca örnek olarak incele. P(doom) şarkısının hakları sahibine ait.
