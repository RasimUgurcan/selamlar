"""Hareket kalite kontrolü (Fable Motion Playbook, ders 4: durağan kareler yalan söyler).

1. Donma tespiti: ffmpeg freezedetect, 0.5 sn ve üstü hiç değişmeyen bölümler.
2. Hareket grafiği: her kare ile bir önceki arasındaki ortalama piksel farkı.
   Kesintisiz düz bir çizgi = donmuş film.
Kullanım: python qa.py out/kufi-jelly.mp4
"""
import re
import subprocess
import sys

import numpy as np

video = sys.argv[1]
r = subprocess.run(["ffmpeg", "-hide_banner", "-i", video, "-vf", "freezedetect=n=0.002:d=0.5", "-map", "0:v",
                    "-f", "null", "-"], capture_output=True, text=True)
freezes = re.findall(r"freeze_start: ([\d.]+).*?freeze_end: ([\d.]+)", r.stderr, re.S)
print("Donma bölümleri (>=0.5 sn):", freezes if freezes else "yok")

w, h = 54, 96
raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", video, "-vf", f"scale={w}:{h},format=gray",
                      "-f", "rawvideo", "-"], capture_output=True).stdout
frames = np.frombuffer(raw, np.uint8).reshape(-1, h, w).astype(np.float32)
diff = np.abs(np.diff(frames, axis=0)).mean(axis=(1, 2))
fps = 30
print(f"{len(frames)} kare; kare başına ortalama değişim: {diff.mean():.2f}")
for s in range(0, len(diff), fps):
    seg = diff[s:s + fps]
    bar = "#" * int(min(60, seg.mean() * 6))
    print(f"{s / fps:5.1f} sn  {seg.mean():5.2f}  {bar}")
still = (diff < 0.05).astype(int)
runs, cur = [], 0
for i, v in enumerate(still):
    cur = cur + 1 if v else 0
    if cur == 15:
        runs.append(i / fps)
print("0.5 sn'den uzun neredeyse durağan bölüm başlangıçları:", runs if runs else "yok")
