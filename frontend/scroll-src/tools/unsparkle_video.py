"""Remove the static Gemini sparkle from a video by reversing its white overlay on every frame.
Fit (half-size, centre, opacity) once on sample frames, then: orig = (obs - a*M*255) / (1 - a*M).
Usage: unsparkle_video.py FFMPEG IN.mp4 OUT.mp4 cx cy half
"""
import subprocess
import sys

import cv2
import numpy as np

FF, SRC, DST = sys.argv[1:4]
CX0, CY0, HALF0 = map(float, sys.argv[4:7])
W, H = 1280, 720
P = 0.70


def star(half, cx, cy, w, h, ss=4):
    yy, xx = (np.mgrid[0:h * ss, 0:w * ss] + 0.5) / ss
    m = ((np.abs(xx - cx) / half) ** P + (np.abs(yy - cy) / half) ** P <= 1).astype(np.float32)
    return m.reshape(h, ss, w, ss).mean(axis=(1, 3))


def frames(path):
    p = subprocess.Popen([FF, '-v', 'error', '-i', path, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
    while True:
        buf = p.stdout.read(W * H * 3)
        if len(buf) < W * H * 3:
            break
        yield np.frombuffer(buf, np.uint8).reshape(H, W, 3)
    p.wait()


R = int(HALF0 * 2.2)
x0, y0 = int(CX0) - R, int(CY0) - R
allf = list(frames(SRC))
samples = np.stack([f[y0:y0 + 2 * R, x0:x0 + 2 * R].astype(np.float32) for f in allf[::12]])


def restore(patch, m, a):
    am = (a * m)[..., None]
    return np.clip((patch - am * 255) / (1 - am), 0, 255)


def edge_energy(img, d):
    g = img.mean(axis=-1)
    gx, gy = np.abs(np.diff(g, axis=1))[:-1, :], np.abs(np.diff(g, axis=0))[:, :-1]
    band = (d[:-1, :-1] > 0.75) & (d[:-1, :-1] < 1.3)
    return float(((gx + gy)[..., band] if g.ndim == 3 else (gx + gy)[band]).sum())


# Fixed overlay (fitted on clip3's flat jacket: half 24, centre 1157.5,598, opacity 0.29 in every channel).
half, cx, cy, a = HALF0, CX0 - x0, CY0 - y0, float(sys.argv[7]) if len(sys.argv) > 7 else 0.29
m = star(half, cx, cy, 2 * R, 2 * R)
_yy, _xx = np.mgrid[0:2 * R, 0:2 * R] + 0.5
_d = (np.abs(_xx - cx) / half) ** P + (np.abs(_yy - cy) / half) ** P
RW = float(sys.argv[8]) if len(sys.argv) > 8 else 0.16
RING = ((_d > 1 - RW) & (_d < 1 + RW)).astype(np.uint8) if RW > 0 else np.zeros_like(_d, np.uint8)  # compression-blurred edge: inpaint after the reversal
print(f'{SRC}: half={half:.1f} centre=({cx + x0:.1f},{cy + y0:.1f}) alpha={a:.2f}')

enc = subprocess.Popen([FF, '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', '24', '-i', '-',
                        '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', DST], stdin=subprocess.PIPE)
for f in allf:
    g = f.copy()
    fixed = restore(f[y0:y0 + 2 * R, x0:x0 + 2 * R].astype(np.float32), m, a).astype(np.uint8)
    g[y0:y0 + 2 * R, x0:x0 + 2 * R] = cv2.inpaint(np.ascontiguousarray(fixed), RING, 2, cv2.INPAINT_TELEA) if RW > 0 else fixed
    enc.stdin.write(g.tobytes())
enc.stdin.close()
enc.wait()
