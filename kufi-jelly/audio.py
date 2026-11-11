"""Jöle videosunun sesi: 120 BPM altlık + simülasyona senkron efektler.

Sert jöle (1/10) kısa ve tok bir "tok", yumuşak jöle (10/10) ıslak, uzun bir
"şlap" + titreşim yapar; damlacıklar düştükçe "plip"ler gelir.
Kullanım: python audio.py cues.json ses.wav   (yalnızca numpy)
"""
import json
import sys
import wave

import numpy as np

SR = 48000
BEAT = 0.5  # 120 BPM, görüntüdeki kurguyla aynı
rng = np.random.default_rng(11)


def env(n, a=0.005, d=0.2):
    t = np.arange(n) / SR
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / d)


def bandnoise(n, lo, hi):
    X = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    X[(f < lo) | (f > hi)] = 0
    y = np.fft.irfft(X, n)
    return y / (np.abs(y).max() + 1e-9)


def sweep(f0, f1, dur, vib=0.0, vib_hz=0.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = np.geomspace(f0, f1, n) * (1 + vib * np.sin(2 * np.pi * vib_hz * t))
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def add(buf, sig, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= len(buf) or i < 0:
        return
    sig = sig[: len(buf) - i]
    buf[i:i + len(sig), 0] += sig * gain * (1 - max(pan, 0))
    buf[i:i + len(sig), 1] += sig * gain * (1 + min(pan, 0))


def music(buf, dur):
    roots = [65.41, 55.0, 43.65, 49.0]                  # C - Am - F - G
    scale = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5]
    pat = [0, 2, 4, 2, 3, 2, 1, 0, 2, 4, 5, 4, 3, 1, 2, 0]
    for b in range(int(dur / BEAT) + 1):
        t = b * BEAT
        bar = (b // 4) % 4
        if b % 4 == 0:
            n = int(BEAT * 3.8 * SR)
            tt = np.arange(n) / SR
            add(buf, (np.sin(2 * np.pi * roots[bar] * tt) + 0.3 * np.sin(4 * np.pi * roots[bar] * tt)) * env(n, 0.01, 1.0), t, 0.3)
        add(buf, sweep(150, 45, 0.2) * env(int(0.2 * SR), 0.001, 0.08), t, 0.36)          # kick her vuruşta
        if b % 2 == 1:                                                                     # clap 2 ve 4
            add(buf, bandnoise(int(0.15 * SR), 900, 5000) * env(int(0.15 * SR), 0.001, 0.05), t, 0.13)
        for h in range(2):
            add(buf, bandnoise(int(0.04 * SR), 7000, 14000) * env(int(0.04 * SR), 0.001, 0.012), t + h * BEAT / 2, 0.045, 0.3)
            k = (b * 2 + h) % len(pat)
            if (b * 2 + h) % 3 != 2:
                f = scale[pat[k]]
                n = int(0.45 * SR)
                tt = np.arange(n) / SR
                pl = (np.sin(2 * np.pi * f * tt) + 0.4 * np.sin(4 * np.pi * f * tt) + 0.15 * np.sin(6 * np.pi * f * tt)) * env(n, 0.002, 0.13)
                add(buf, pl, t + h * BEAT / 2, 0.09, -0.3 if h else 0.3)


def impact(soft):
    """soft: 0.1 (sert) … 1.0 (çok yumuşak)"""
    dur = 0.25 + 0.9 * soft
    n = int(dur * SR)
    out = np.zeros(n)
    # gövde: sertte kısa tok ses, yumuşakta aşağı kayan "blorp"
    body = sweep(220 - 120 * soft, 70 - 25 * soft, dur, vib=0.08 * soft, vib_hz=11) * env(n, 0.002, 0.06 + 0.22 * soft)
    out += body * (0.9 - 0.3 * soft)
    # ıslak şlap: genliği titreşen gürültü
    wet = bandnoise(n, 250, 2500 + 2500 * soft)
    t = np.arange(n) / SR
    am = 0.55 + 0.45 * np.sin(2 * np.pi * (18 + 10 * soft) * t)
    out += wet * am * env(n, 0.001, 0.03 + 0.12 * soft) * (0.25 + 0.75 * soft)
    if soft < 0.25:  # sert jöle: kısa tıklama
        click = bandnoise(int(0.03 * SR), 1500, 7000) * env(int(0.03 * SR), 0.0003, 0.006)
        out[:len(click)] += click * 0.7
    if soft > 0.6:  # titreşen gövde
        m = int(1.2 * SR)
        tt = np.arange(m) / SR
        wob = np.sin(2 * np.pi * 95 * tt) * (0.5 + 0.5 * np.sin(2 * np.pi * 7 * tt)) * env(m, 0.02, 0.35)
        out = np.pad(out, (0, max(0, m - n)))
        out[:m] += wob * 0.35 * soft
    return out


def plip(i):
    f = 900 + 140 * (i % 5)
    return sweep(f * 1.4, f, 0.07) * env(int(0.07 * SR), 0.0005, 0.02)


def whoosh():
    n = int(0.4 * SR)
    t = np.arange(n) / SR
    e = np.sin(np.pi * t / 0.4) ** 2
    return (bandnoise(n, 200, 1200) * (1 - t / 0.4) + bandnoise(n, 1200, 6000) * (t / 0.4)) * e


def pop(s):
    return sweep(600, 1300, 0.09) * env(int(0.09 * SR), 0.001, 0.03) * s


DROPS = {1: 0, 3: 0, 5: 5, 7: 9, 10: 16}


def main():
    data = json.load(open(sys.argv[1]))
    dur = data["duration"]
    buf = np.zeros((int(dur * SR) + SR, 2))
    music(buf, dur)
    fx = np.zeros_like(buf)
    for c in data["cues"]:
        if c["type"] == "whoosh":
            add(fx, whoosh(), max(0, c["t"] - 0.08), 0.4)
        elif c["type"] == "impact":
            s = round(c["strength"] * 10)
            add(fx, impact(c["strength"]), c["t"], 1.0)
            for k in range(DROPS.get(s, 0)):          # damlacıklar ~0.35–0.65 sn sonra iner
                add(fx, plip(k), c["t"] + 0.33 + 0.022 * k + 0.01 * (k % 3), 0.18, pan=((k % 5) - 2) / 3)
        elif c["type"] == "pop":
            add(fx, pop(c["strength"]), c["t"], 0.5)
    out = (buf * 0.75 + fx)[: int(dur * SR)]
    f = int(0.5 * SR)
    out[-f:] *= np.linspace(1, 0, f)[:, None]
    out = np.tanh(out * 1.15)
    out = out / (np.abs(out).max() + 1e-9) * 0.89
    with wave.open(sys.argv[2], "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((out * 32767).astype(np.int16).tobytes())
    print("ses:", sys.argv[2], f"{dur:.2f} sn,", len(data["cues"]), "efekt")


if __name__ == "__main__":
    main()
