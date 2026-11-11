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

## Seri fikirleri (mevcut Short'ların devamı)

- **Face merdiveni, her karakterle:** Face 1 → 4 → 64 → 1K → 16K. Villager, Golem, Witch ve diğerleri için ayrı bölümler.
- **Sertlik serisi:** aynı `grid`, artan `stiffness`, etiket `"Softness 1/10 … 10/10"`.
- **"Hangisi daha iyi?"** formatı: aynı karaktere farklı renk ve sertlikte kumaşlar.
