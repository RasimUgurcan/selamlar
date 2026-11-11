# Kufi Animation: Short üreticisi

`kufi_short.py`, kanalındaki **"Face N" kumaş simülasyonu** formatında dikey (1080×1920) Short videoları otomatik üretir.

Her klipte stüdyo fonu, ışıklar, kamera, karakter ve düşen ızgaralı kumaş Blender'da kurulur. Simülasyon ve render alındıktan sonra ffmpeg etiketi ("Face 4") ve "Kufi Animation" yazısını basar, klipleri tek bir MP4 dosyasında birleştirir.

## Gerekenler

- **Blender 4.2 veya üstü** (5.3 ile test edildi)
- **ffmpeg** (PATH'te olmalı)

## Çalıştırma

```bash
cd kufi
# Hızlı önizleme (yarım çözünürlük, az örnek):
blender -b -P kufi_short.py -- bolumler/face-merdiveni.json --onizleme
# Tam kalite:
blender -b -P kufi_short.py -- bolumler/face-merdiveni.json
# Yalnızca 3. klibi dene:
blender -b -P kufi_short.py -- bolumler/face-merdiveni.json --klip 3 --onizleme
```

Çıktı `kufi/cikti/<bölüm adı>/<bölüm adı>.mp4` yoluna yazılır.

> Ekran kartın varsa bölüm dosyasına `"gpu": true` ekle. Render çok hızlanır.

## Kendi karakterini kullanmak

Elindeki karakter modellerini (Villager, Golem, Cat gibi) `kufi/modeller/` klasörüne koy ve bölüm dosyasına yaz:

```json
"model": "../modeller/villager.fbx",
"model_rot_z": 0
```

- `.blend`, `.fbx`, `.obj`, `.glb` ve `.gltf` dosyaları desteklenir.
- Model otomatik olarak `model_height` boyuna (varsayılan 1.9) ölçeklenir, zemine ve ortaya oturtulur.
- Her klipte ayrı bir `"model"` verirsen bir bölümde farklı karakterler kullanabilirsin.
- Model verilmezse sade bir yer tutucu blok figür kullanılır.

## Bölüm dosyası (`bolumler/*.json`)

| Alan | Anlamı |
|---|---|
| `clips[].grid` | Kumaşın ızgara bölümü. Yüz sayısı `grid²` olur: 1 → Face 1, 2 → Face 4, 32 → Face 1K, 1000 → Face 1M |
| `clips[].label` | Etiketi elle yazmak için (ör. `"Softness 3/10"`). Boş bırakılırsa "Face N" yazılır |
| `clips[].bg` | Fon rengi (hex) |
| `clips[].sheet_color` | Kumaş rengi. Izgara çizgileri otomatik olarak açık tonda çizilir; `line_color` ile değiştirilebilir |
| `clips[].seconds` | Klip süresi |
| `clips[].stiffness`, `bending`, `mass` | Kumaşın sertliği, kıvrılması ve ağırlığı |
| `clips[].drop_height`, `sheet_size`, `spin`, `tilt_x`, `tilt_y` | Düşüş yüksekliği, kumaş boyu ve açısı |
| `samples`, `fps`, `resolution` | Render kalitesi ve formatı |
| `camera.location`, `camera.target`, `camera.lens` | Kamera konumu, baktığı nokta ve lens |
| `watermark`, `watermark_color`, `font` | Alttaki yazı, rengi ve kullanılan font |

> 1M yüzlü (grid 1000) kumaş çok ağırdır: güçlü bir bilgisayar ve saatler gerekir. 64–128 arası değerler hızlıdır ve yine çok iyi görünür.

## Sinematik ortamlar (her video ayrı bir dünya)

Düz renkli fon yerine bölüm dosyasına bir ortam adı yaz:

```json
"ortam": "gotik-kutuphane"
```

Bir ortamı hızlıca denemek için video yerine tek bir "stil karesi" al (yaklaşık 20 saniye sürer):

```bash
blender -b -P kufi_short.py -- bolumler/ortam-deneme.json --onizleme --kare 70 --ortam neon-kemerler
```

Hazır ortamlar `ortamlar/` klasöründe:

| Ortam | Konsept |
|---|---|
| `gotik-kutuphane` | Gece, mum ışığında antika kütüphane: parke zemin, kitaplıklar, gotik dolap, mermer büst, avize, ay ışığı alan pencere |
| `endustriyel-atolye` | Tuğla duvarlı eski atölye: fabrika penceresi, havada toz, fıçılar, sandıklar, matkap tezgâhı, sarkan lamba |
| `neon-kemerler` | Soyut rüya koridoru: sonsuz kemerler, neon halkalar, havada süzülen şekiller, ayna gibi zemin |

Bir ortam dosyası şu parçalardan oluşur. Her biri isteğe bağlıdır.

- **`hdri`**: [Poly Haven](https://polyhaven.com/hdris)'den gerçek bir mekânın 360° fotoğrafı. Sahnenin ışığını ve yansımalarını verir.
- **`zemin`, `duvarlar`**: Poly Haven dokuları (ahşap, mermer, tuğla, beton…). Duvarlarda ay ışığı ya da gün ışığı alan pencereler olabilir, istenirse kayıtlı.
- **`podyum`**: Karakterin durduğu yer: halı, mermer kaide ya da ışık şeritli platform.
- **`dekor`**: Poly Haven'daki 500'den fazla 3D modelden seçilenler. Her biri için konum, dönüş ve ölçek verilir.
- **`prosedurel`**: Kodla üretilen soyut yapılar (`kemerler`, `yuzen`).
- **`isiklar`**: Spot, nokta, alan ve güneş ışıkları. Konum, hedef, renk ve güç ayarlanır.
- **`sis`**: Işık hüzmeleri ve derinlik hissi için havadaki toz ya da sis.
- **`kamera`**: `lens`, `f_stop` (arka plan bulanıklığı), `dolly` (yavaş yaklaşma), `donus` (karakterin etrafında dönme).
- **`renk_yonetimi`**: Renk dönüşümü (`AgX`), görünüm (`Punchy`, `Medium High Contrast`) ve pozlama.

Poly Haven varlıklarının hepsi **CC0** lisanslıdır, yani ticari kullanım serbesttir. İlk kullanımda `kufi/.onbellek/` klasörüne indirilirler, sonraki render'lar internet gerektirmez.

**Yeni ortam eklemek:** Mevcut bir ortam dosyasını kopyala. Model, doku ve HDRI adlarını [polyhaven.com](https://polyhaven.com) adreslerinden al: `polyhaven.com/a/<ad>` adresindeki `<ad>` kısmı. Dikey kadraj dar olduğu için dekoru karakterin **arkasına** ve **iki yanına** (|x| < 2.5) diz.

## Seri fikirleri (mevcut Short'ların devamı)

- **Face merdiveni, her karakterle:** Face 1 → 4 → 64 → 1K → 16K. Villager, Golem, Witch ve diğerleri için ayrı bölümler.
- **Sertlik serisi:** aynı `grid`, artan `stiffness`, etiket `"Softness 1/10 … 10/10"`.
- **"Hangisi daha iyi?"** formatı: aynı karaktere farklı renk ve sertlikte kumaşlar.
