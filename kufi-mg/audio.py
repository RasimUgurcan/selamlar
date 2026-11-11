"""Videonun sesini sentezler: müzik altlığı + efektler (geçiş, çarpma, pop).

Efekt zamanları render sırasında simülasyondan gelir (cues.json): kumaş karaktere
değdiği an "impact" sesi tam o karede çalar.
Kullanım: python audio.py cues.json ses.wav   (yalnızca numpy gerekir)
"""
import json
import sys
import wave

import numpy as np

SR = 48000
BEAT = 0.425  # 141 BPM, görüntüdeki kurguyla aynı
rng = np.random.default_rng(7)


def env(n, a=0.005, d=0.2):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / d)
    return e


def bandnoise(n, lo, hi):
    x = rng.standard_normal(n)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    X[(f < lo) | (f > hi)] = 0
    y = np.fft.irfft(X, n)
    return y / (np.abs(y).max() + 1e-9)


def tone(freq_start, freq_end, dur, shape="sine"):
    n = int(dur * SR)
    f = np.geomspace(freq_start, freq_end, n)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) if shape == "sine" else np.sign(np.sin(ph)) * 0.3 + np.sin(ph) * 0.7


def pluck(freq, dur=0.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = (np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(4 * np.pi * freq * t) + 0.12 * np.sin(6 * np.pi * freq * t))
    return y * env(n, 0.003, 0.16)


def add(buf, sig, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= buf.shape[0]:
        return
    sig = sig[: buf.shape[0] - i]
    buf[i:i + len(sig), 0] += sig * gain * (1 - max(pan, 0))
    buf[i:i + len(sig), 1] += sig * gain * (1 + min(pan, 0))


def music(buf, dur):
    # F majör pentatonik, 4 akorluk döngü (F - Dm - Bb - C), her akor 1 ölçü (4 vuruş)
    roots = [87.31, 73.42, 58.27, 65.41]
    scale = [349.23, 392.0, 440.0, 523.25, 587.33, 698.46, 783.99, 880.0]
    pattern = [0, 2, 4, 2, 5, 4, 2, 1, 0, 2, 4, 6, 5, 4, 2, 3]
    n_beats = int(dur / BEAT) + 1
    for b in range(n_beats):
        t = b * BEAT
        bar = (b // 4) % 4
        if b % 4 == 0:  # bas
            nb = int(BEAT * 3.6 * SR)
            tt = np.arange(nb) / SR
            bass = np.sin(2 * np.pi * roots[bar] * tt) * env(nb, 0.01, 0.9)
            add(buf, bass, t, 0.32)
        # yumuşak davul: kick 1 ve 3'te, hi-hat sekizliklerde
        if b % 2 == 0:
            add(buf, tone(140, 45, 0.18) * env(int(0.18 * SR), 0.001, 0.07), t, 0.38)
        else:
            add(buf, bandnoise(int(0.12 * SR), 1500, 6000) * env(int(0.12 * SR), 0.001, 0.05), t, 0.10)
        for h in range(2):
            add(buf, bandnoise(int(0.05 * SR), 7000, 14000) * env(int(0.05 * SR), 0.001, 0.015),
                t + h * BEAT / 2, 0.05, pan=0.3)
        # pluck melodisi (sekizlikler)
        for h in range(2):
            k = (b * 2 + h) % len(pattern)
            if (b * 2 + h) % 3 == 2:
                continue
            add(buf, pluck(scale[pattern[k]] / 2 if bar == 2 else scale[pattern[k]]), t + h * BEAT / 2, 0.11,
                pan=-0.25 if h else 0.25)


def whoosh():
    n = int(0.42 * SR)
    t = np.arange(n) / SR
    e = np.sin(np.pi * np.clip(t / 0.42, 0, 1)) ** 2
    lo = bandnoise(n, 200, 1200)
    hi = bandnoise(n, 1200, 6000)
    mix = lo * (1 - t / 0.42) + hi * (t / 0.42)
    return mix * e


def impact(strength):
    n = int(0.6 * SR)
    thud = tone(110, 38, 0.6) * env(n, 0.002, 0.16)
    fwump = bandnoise(n, 80, 900) * env(n, 0.004, 0.09)
    out = thud * 0.9 * strength + fwump * (0.4 + 0.5 * (1 - strength))
    if strength > 0.9:  # Face 1: sert levha kafaya "bonk"
        m = int(0.5 * SR)
        tt = np.arange(m) / SR
        boing = np.sin(2 * np.pi * (330 + 60 * np.sin(2 * np.pi * 14 * tt)) * tt) * env(m, 0.002, 0.18)
        wood = bandnoise(int(0.08 * SR), 600, 3000) * env(int(0.08 * SR), 0.0005, 0.02)
        out[:m] += boing * 0.5
        out[:len(wood)] += wood * 0.6
    return out


def pop(strength):
    return tone(620, 1250, 0.09) * env(int(0.09 * SR), 0.001, 0.03) * strength


def main():
    data = json.load(open(sys.argv[1]))
    dur = data["duration"]
    buf = np.zeros((int(dur * SR) + SR, 2))
    music(buf, dur)
    fx = np.zeros_like(buf)
    for c in data["cues"]:
        if c["type"] == "whoosh":
            add(fx, whoosh(), max(0, c["t"] - 0.08), 0.42)
        elif c["type"] == "impact":
            add(fx, impact(c["strength"]), c["t"], 0.95)
        elif c["type"] == "pop":
            add(fx, pop(c["strength"]), c["t"], 0.5)
    out = buf * 0.8 + fx
    out = out[: int(dur * SR)]
    fade = int(0.6 * SR)
    out[-fade:] *= np.linspace(1, 0, fade)[:, None]
    out = np.tanh(out * 1.1)  # yumuşak limiter
    out /= np.abs(out).max() + 1e-9
    out *= 0.89
    pcm = (out * 32767).astype(np.int16)
    with wave.open(sys.argv[2], "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print("ses:", sys.argv[2], f"{dur:.2f} sn,", len(data["cues"]), "efekt")


if __name__ == "__main__":
    main()
